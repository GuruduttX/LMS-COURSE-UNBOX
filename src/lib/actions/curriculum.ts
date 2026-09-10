"use server";

/**
 * Writing the curriculum tree: create, edit, reorder, publish, delete.
 *
 * One module for the whole tree rather than one per level, because every
 * mutation here shares the same five steps and a second copy of them is a
 * second place for the scope check to drift:
 *
 *     requireRole → can() → assertScope → validate → write → writeAudit → revalidate
 *
 * `requireRole("teacher")` establishes admin-or-teacher — it admits any admin —
 * and never a program manager, which is the whole of "a manager cannot change
 * program content". `assertScope` then establishes *which* program, the
 * question a role alone cannot answer. Each action re-checks both itself,
 * because a server action is its own front door: the page that rendered the
 * form is not a guard.
 *
 * ## Keys, not ObjectIds
 *
 * Forms post the stable `key` of each node (`pm-c4-m2`) and this module
 * resolves it. Keys are what the URLs, `User.assignments[].courseIds` and the
 * migration already speak, and keeping ObjectIds out of the markup means a
 * posted id can only ever name a node the poster could already see.
 *
 * ## Three rules the write path enforces
 *
 * - **New nodes start as drafts.** A teacher creating a module mid-term must not
 *   have it appear to students half-written. The status field on the form
 *   defaults to draft and publishing is a separate, deliberate act.
 * - **`order` is contiguous 0..n−1**, rewritten across the whole sibling set on
 *   every reorder, and `Module.number` / `Topic.number` are recomputed from it —
 *   so "Module 2" can never disagree with position 2.
 * - **Delete cascades, and archive is the reversible door.** See
 *   `curriculum/authoring.ts` for who may delete which level and why.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { Types } from "mongoose";

import { writeAudit } from "@/lib/auth/audit";
import { assertScope, requireRole, type CurrentUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import {
  canDeleteNode,
  canDeleteWork,
  NODE_TYPE_LABEL,
  workDeleteDeniedReason,
  type NodeType,
} from "@/lib/curriculum/authoring";
import type { SubtopicKind } from "@/lib/curriculum/kinds";
import { toAuthoredQuestion } from "@/lib/curriculum/question-kinds";
import type { AssessmentScope } from "@/lib/data/staff-work";
import { isSubmissionFormat } from "@/lib/curriculum/submission-formats";
import { isNodeStatus, type NodeStatus } from "@/lib/curriculum/rules";
import { destroyAsset } from "@/lib/uploads/cloudinary";
import {
  MATERIAL_KINDS,
  parseUploadedFiles,
  type UploadedFile,
} from "@/lib/uploads/kinds";
import { configuredLibraryId as bunnyLibraryId, deleteVideo } from "@/lib/video/bunny";
import { parseStoredVideo } from "@/lib/video/shared";
import { adminHrefs, teacherHrefs } from "@/components/staff/curriculum/hrefs";
import { connectToDatabase } from "@/lib/db";
import {
  hasErrors,
  readMinutesFor,
  validateAssessment,
  validateAssignment,
  validateCourse,
  validateMaterial,
  validateModule,
  validateProgram,
  validateSubtopic,
  validateTopic,
  type AssessmentInput,
  type AssignmentInput,
  type CourseInput,
  type MaterialInput,
  type NodeInput,
  type ProgramInput,
  type QuestionInput,
  type SubtopicInput,
} from "@/lib/validation/curriculum";
import type {
  ActionState,
  AssessmentFormState,
  AssignmentFormState,
  CourseFormState,
  MaterialFormState,
  NodeFormState,
  ProgramFormState,
  SubtopicFormState,
} from "./curriculum-state";
import { Assessment } from "@/models/Assessment";
import { Assignment } from "@/models/Assignment";
import { Attempt } from "@/models/Attempt";
import { Course } from "@/models/Course";
import { Module } from "@/models/Module";
import { Program } from "@/models/Program";
import { Submission } from "@/models/Submission";
import { Subtopic } from "@/models/Subtopic";
import { SubtopicProgress } from "@/models/SubtopicProgress";
import { Topic } from "@/models/Topic";

/* -------------------------------- program -------------------------------- */

/**
 * Create or update a program.
 *
 * Admin only, and not because of the content — a program's `slug` is the join
 * key for live sessions, enrolments and staff assignments, so minting one is a
 * decision about the institution rather than about teaching.
 */
export async function saveProgram(
  previous: ProgramFormState,
  formData: FormData,
): Promise<ProgramFormState> {
  const actor = await requireRole("admin");

  if (!can(actor, "program.create")) {
    return { ...previous, ok: false, error: DENIED, errors: {} };
  }

  const mode = readMode(formData);
  const values: ProgramInput = {
    slug: text(formData, "slug"),
    title: text(formData, "title"),
    summary: text(formData, "summary"),
    deadline: text(formData, "deadline"),
    status: text(formData, "status") || "draft",
  };

  const errors = validateProgram(values);
  if (hasErrors(errors)) return { ok: false, errors, values };

  await connectToDatabase();

  const fields = {
    title: values.title.trim(),
    summary: values.summary.trim(),
    deadline: toDate(values.deadline),
    status: values.status as NodeStatus,
  };

  if (mode === "create") {
    // The slug is the identity of everything below it, so a collision has to be
    // a message rather than a second program answering to the same name.
    const clash = await Program.exists({ slug: values.slug });
    if (clash) {
      return {
        ok: false,
        values,
        errors: { slug: "A program already uses that slug." },
      };
    }

    const order = await Program.countDocuments({});
    const created = await Program.create({
      ...fields,
      slug: values.slug,
      order,
      createdBy: actor.id,
    });

    await writeAudit(actor, {
      action: "program.create",
      targetType: "Program",
      targetId: String(created._id),
      summary: `Created program ${fields.title}`,
      meta: { slug: values.slug },
    });

    revalidatePath("/admin/programs");
    redirect(`/admin/programs/${values.slug}`);
  }

  // The slug is never editable: changing it would orphan every session, every
  // assignment and every URL pointing at the program.
  const slug = text(formData, "originalSlug") || values.slug;
  const program = await Program.findOneAndUpdate({ slug }, fields, {
    returnDocument: "after",
  })
    .select("_id")
    .lean();
  if (!program) notFound();

  await writeAudit(actor, {
    action: "program.update",
    targetType: "Program",
    targetId: String(program._id),
    summary: `Updated program ${fields.title}`,
    meta: { slug },
  });

  revalidatePath("/admin/programs");
  revalidatePath(`/admin/programs/${slug}`);

  return { ok: true, errors: {}, values };
}

/* --------------------------------- course -------------------------------- */

export async function saveCourse(
  _previous: CourseFormState,
  formData: FormData,
): Promise<CourseFormState> {
  const { actor, programSlug, programId } = await authorContext(formData);

  const mode = readMode(formData);
  const values: CourseInput = {
    key: text(formData, "key"),
    number: text(formData, "number"),
    title: text(formData, "title"),
    summary: text(formData, "summary"),
    completeBy: text(formData, "completeBy"),
    status: text(formData, "status") || "draft",
  };

  const errors = validateCourse(values);
  if (hasErrors(errors)) return { ok: false, errors, values };

  const fields = {
    title: values.title.trim(),
    summary: values.summary.trim(),
    // Blank is a standalone checkpoint, which prints no "Course N".
    number: values.number.trim() ? Number(values.number) : null,
    completeBy: toDate(values.completeBy),
    status: values.status as NodeStatus,
  };

  if (mode === "create") {
    const taken = await keyTaken(Course, values.key);
    if (taken) return { ok: false, values, errors: { key: KEY_TAKEN } };

    const order = await nextOrder(Course, { programId });
    const created = await Course.create({
      ...fields,
      programId,
      key: values.key,
      order,
      createdBy: actor.id,
    });

    await audit(actor, "course", "create", String(created._id), fields.title, {
      programSlug,
      key: values.key,
    });
    revalidateProgram(programSlug);
    redirect(hrefsFor(formData, programSlug).course(values.key));
  }

  const course = await Course.findOneAndUpdate(
    { programId, key: text(formData, "originalKey") || values.key },
    fields,
    { returnDocument: "after" },
  )
    .select("_id key")
    .lean();
  if (!course) notFound();

  await audit(actor, "course", "update", String(course._id), fields.title, {
    programSlug,
    key: course.key,
  });
  revalidateProgram(programSlug);

  return { ok: true, errors: {}, values };
}

/* ---------------------------- module and topic --------------------------- */

export async function saveModule(
  _previous: NodeFormState,
  formData: FormData,
): Promise<NodeFormState> {
  return saveTreeNode(formData, "module");
}

export async function saveTopic(
  _previous: NodeFormState,
  formData: FormData,
): Promise<NodeFormState> {
  return saveTreeNode(formData, "topic");
}

/**
 * Modules and topics carry identical fields and identical rules; only the
 * parent they hang off and the word in the error message differ.
 */
async function saveTreeNode(
  formData: FormData,
  type: "module" | "topic",
): Promise<NodeFormState> {
  const { actor, programSlug, programId } = await authorContext(formData);

  const mode = readMode(formData);
  const values: NodeInput = {
    key: text(formData, "key"),
    title: text(formData, "title"),
    status: text(formData, "status") || "draft",
  };

  const errors =
    type === "module" ? validateModule(values) : validateTopic(values);
  if (hasErrors(errors)) return { ok: false, errors, values };

  const course = await courseFor(programId, text(formData, "courseKey"));
  const model = modelFor(type);

  const parent =
    type === "module"
      ? { courseId: course._id }
      : {
          courseId: course._id,
          moduleId: (await moduleFor(programId, text(formData, "moduleKey")))
            ._id,
        };

  // Study material is deliberately absent: it is attached from the module's own
  // screen, by `saveModuleMaterial`, so this save can never overwrite it.
  const fields = {
    title: values.title.trim(),
    status: values.status as NodeStatus,
  };

  if (mode === "create") {
    const taken = await keyTaken(model, values.key);
    if (taken) {
      return { ok: false, values, errors: { key: KEY_TAKEN } };
    }

    const scope =
      type === "module"
        ? { courseId: course._id }
        : { moduleId: (parent as { moduleId: Types.ObjectId }).moduleId };
    const order = await nextOrder(model, scope);

    const created = await model.create({
      ...fields,
      ...parent,
      programId,
      key: values.key,
      order,
      // Position and label are the same fact; see `renumber`.
      number: order + 1,
    });

    await audit(actor, type, "create", String(created._id), fields.title, {
      programSlug,
      key: values.key,
    });
    revalidateProgram(programSlug);

    const hrefs = hrefsFor(formData, programSlug);
    redirect(
      type === "module"
        ? hrefs.module(course.key, values.key)
        : hrefs.module(course.key, text(formData, "moduleKey")),
    );
  }

  const updated = await model
    .findOneAndUpdate(
      { programId, key: text(formData, "originalKey") || values.key },
      fields,
    )
    .select("_id")
    .lean();
  if (!updated) notFound();

  await audit(actor, type, "update", String(updated._id), fields.title, {
    programSlug,
    key: values.key,
  });
  revalidateProgram(programSlug);

  return { ok: true, errors: {}, values };
}

/* ----------------------------- study material ---------------------------- */

/**
 * Attach a study material to a module, replace the one that is there, or
 * rename it.
 *
 * Its own action rather than a field on the module form, and its own screen —
 * the module's — for three reasons:
 *
 * - It is the only content on a module that is not reached from that screen.
 *   Topics, subtopics and the test all live there; the handout being the one
 *   thing hidden behind "Edit details" is why nobody could find it.
 * - One editing surface means one writer. When the file was also a field on
 *   the module form, a form left open in another tab re-posted the old file on
 *   save — resurrecting a record that pointed at bytes already deleted.
 * - Removing it is a *decision*, not an empty field, so it gets a confirm and
 *   an action of its own. See `removeModuleMaterial`.
 */
export async function saveModuleMaterial(
  _previous: MaterialFormState,
  formData: FormData,
): Promise<MaterialFormState> {
  const { actor, programSlug, programId } = await authorContext(formData);

  const values: MaterialInput = { materialTitle: text(formData, "materialTitle") };

  const uploaded = parseUploadedFiles(text(formData, "material"), MATERIAL_KINDS);
  const material = uploaded.files[0] ?? null;

  const errors = validateMaterial(values, { hasMaterial: Boolean(material) });
  if (uploaded.error) errors.material = uploaded.error;
  if (hasErrors(errors)) return { ok: false, errors, values, material };

  // `before`, not `after`: the only field read back is the material this save
  // is about to replace, and it has to be the *old* one to be worth deleting.
  const updated = await Module.findOneAndUpdate(
    { programId, key: text(formData, "key") },
    { material, materialTitle: values.materialTitle.trim() },
    { returnDocument: "before" },
  )
    .select("_id title material")
    .lean();
  if (!updated) notFound();

  const replaced = (updated as { material?: UploadedFile | null }).material;
  await discardReplacedFile(replaced, material);

  await writeAudit(actor, {
    action: "curriculum.update",
    targetType: "Module",
    targetId: String(updated._id),
    summary: `${replaced ? "Replaced" : "Attached"} the study material on module ${updated.title}`,
    meta: { programSlug, key: text(formData, "key"), file: material?.name },
  });
  revalidateProgram(programSlug);

  return { ok: true, errors: {}, values, material };
}

/**
 * Take a module's study material down, and delete the file with it.
 *
 * The title goes too: a caption with nothing under it would show in the
 * outline as a link to nowhere. The bytes are only destroyed once the record
 * no longer points at them — the same order `discardReplacedFile` keeps, and
 * for the same reason: a record pointing at a deleted file is worse than a
 * file nothing points at.
 */
export async function removeModuleMaterial(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { actor, programSlug, programId } = await authorContext(formData);

  const key = text(formData, "key");

  const updated = await Module.findOneAndUpdate(
    { programId, key },
    { material: null, materialTitle: "" },
    { returnDocument: "before" },
  )
    .select("_id title material")
    .lean();
  if (!updated) notFound();

  await discardReplacedFile(
    (updated as { material?: UploadedFile | null }).material,
    null,
  );

  await writeAudit(actor, {
    action: "curriculum.update",
    targetType: "Module",
    targetId: String(updated._id),
    summary: `Removed the study material from module ${updated.title}`,
    meta: { programSlug, key },
  });
  revalidateProgram(programSlug);

  return { ok: true };
}

/* -------------------------------- subtopic ------------------------------- */

export async function saveSubtopic(
  previous: SubtopicFormState,
  formData: FormData,
): Promise<SubtopicFormState> {
  const { actor, programSlug, programId } = await authorContext(formData);

  const mode = readMode(formData);
  const values: SubtopicInput = {
    key: text(formData, "key"),
    title: text(formData, "title"),
    kind: text(formData, "kind"),
    status: text(formData, "status") || "draft",
    video: text(formData, "video"),
    videoUrl: text(formData, "videoUrl"),
    seconds: text(formData, "seconds"),
    caption: text(formData, "caption"),
    body: text(formData, "body"),
    pdf: text(formData, "pdf"),
  };

  // The question list is not a form field — `QuestionBuilder` owns it and posts
  // it as JSON, so a malformed payload is a request problem, not a field error.
  const questions = readQuestions(formData);
  if (questions === null) {
    return {
      ok: false,
      errors: { questions: "The questions could not be read. Reload and try again." },
      values,
      questions: previous.questions,
    };
  }

  // Re-checked here rather than trusted: the field posts JSON from the
  // browser, so a forged post could name any URL on the internet. Only PDFs —
  // the kind is called `pdf`, and `PdfStage` embeds it as one.
  const uploadedPdf = parseUploadedFiles(values.pdf, ["pdf"]);

  const result = validateSubtopic(values, questions, {
    hasPdf: uploadedPdf.files.length > 0,
  });
  const { questions: questionResult, ...fieldErrors } = result;
  if (uploadedPdf.error) fieldErrors.pdf = uploadedPdf.error;

  if (hasErrors(fieldErrors) || questionResult) {
    return {
      ok: false,
      values,
      questions,
      errors: {
        ...fieldErrors,
        // Per-question detail is rendered by the builder from its own copy of
        // the validator; this is the one line shown at the top of the form.
        ...(questionResult
          ? {
              questions:
                questionResult.form ?? "Some questions still need work.",
            }
          : {}),
      },
    };
  }

  const course = await courseFor(programId, text(formData, "courseKey"));
  const moduleDoc = await moduleFor(programId, text(formData, "moduleKey"));
  const topic = await topicFor(programId, text(formData, "topicKey"));

  const kind = values.kind;
  const body = values.body.trim();

  // Already validated above, so the payload is either a well-formed video or
  // nothing. The library id is overwritten from the environment rather than
  // trusted from the form: the browser could name any library, and this is
  // what pins the video to ours.
  const posted = parseStoredVideo(values.video).video;
  const video =
    kind === "video" && posted
      ? { ...posted, libraryId: bunnyLibraryId() ?? posted.libraryId }
      : null;

  // Only the chosen kind's fields are written. Carrying the others across would
  // leave a video URL on a subtopic that is now a quiz, which the preview would
  // then happily show.
  const fields = {
    title: values.title.trim(),
    // Narrowed by `validateSubtopic`, which returns early on an unknown kind.
    kind: kind as SubtopicKind,
    status: values.status as NodeStatus,
    video,
    videoUrl: kind === "video" ? values.videoUrl.trim() : "",
    // Bunny's own measurement beats a typed one, but only once it exists — an
    // encoding video reports 0, and 0 would wipe a runtime already entered.
    seconds:
      video && video.seconds > 0
        ? video.seconds
        : kind === "video" && values.seconds.trim()
          ? Number(values.seconds)
          : 0,
    caption: kind === "video" ? values.caption.trim() : "",
    body: kind === "text" ? body : "",
    readMinutes: kind === "text" && body ? readMinutesFor(body) : 0,
    pdf: kind === "pdf" ? (uploadedPdf.files[0] ?? null) : null,
    questions: kind === "quiz" ? questions : [],
    updatedBy: actor.id,
  };

  if (mode === "create") {
    const taken = await keyTaken(Subtopic, values.key);
    if (taken)
      return { ok: false, values, questions, errors: { key: KEY_TAKEN } };

    const order = await nextOrder(Subtopic, { topicId: topic._id });
    const created = await Subtopic.create({
      ...fields,
      programId,
      courseId: course._id,
      moduleId: moduleDoc._id,
      topicId: topic._id,
      key: values.key,
      order,
    });

    await audit(actor, "subtopic", "create", String(created._id), fields.title, {
      programSlug,
      key: values.key,
      kind,
    });
    revalidateProgram(programSlug);
    redirect(hrefsFor(formData, programSlug).subtopic(course.key, values.key));
  }

  // `before`, not `after`, so we can see which video this subtopic used to
  // own. A swapped-out or removed video has to be deleted from Bunny, or it
  // sits in the library being billed for storage with nothing pointing at it.
  const before = await Subtopic.findOneAndUpdate(
    { programId, key: text(formData, "originalKey") || values.key },
    fields,
    { returnDocument: "before" },
  )
    .select("_id video pdf")
    .lean();
  if (!before) notFound();

  await dropVideo(before.video?.videoId, video?.videoId);
  // Same reasoning as `dropVideo`: a document swapped out or a subtopic that
  // stopped being a PDF leaves an asset nothing points at, and Cloudinary bills
  // for storage monthly.
  await discardReplacedFile(
    (before as { pdf?: UploadedFile | null }).pdf,
    fields.pdf,
  );

  await audit(actor, "subtopic", "update", String(before._id), fields.title, {
    programSlug,
    key: values.key,
    kind,
  });
  revalidateProgram(programSlug);

  return { ok: true, errors: {}, values, questions };
}

/**
 * Delete a video that nothing points at any more.
 *
 * Called after a write has succeeded, never before: deleting first and then
 * failing to save would leave a lesson pointing at a video that no longer
 * exists, which is the one outcome worse than an orphan.
 *
 * Best effort by design. Bunny being unreachable must not fail a save the
 * teacher has already made — the cost of a missed delete is a few cents of
 * storage, and it is logged so it can be swept up.
 */
async function dropVideo(
  had: string | undefined,
  has: string | undefined,
): Promise<void> {
  if (!had || had === has) return;

  try {
    const outcome = await deleteVideo(had);
    if (!outcome.ok) {
      console.error(`[curriculum] orphaned Bunny video ${had}: ${outcome.detail}`);
    }
  } catch (error) {
    console.error(`[curriculum] orphaned Bunny video ${had}:`, error);
  }
}

/* ------------------------------- assessment ------------------------------ */

/**
 * Create or update a module test or a course final test.
 *
 * **There is no `mode` here, unlike every other form.** A course has at most
 * one final test and a module has at most one test — the database enforces the
 * second with a unique index — so the URL is singular and stable whether or not
 * the paper exists yet, and the action decides create-or-update by looking, not
 * by trusting a hidden field. A form posted twice therefore cannot mint a
 * second paper the index would then reject.
 *
 * The lookup deliberately ignores `status`: an *archived* test is still the
 * module's test, and a create that couldn't see it would collide.
 *
 * **What kind of paper this is comes from where it was created**, never from
 * the author: a module test is unproctored and counts toward nothing, a final
 * test and a term paper are proctored and count. Offering those as checkboxes
 * would let someone build an unproctored final, or a module test that silently
 * affected a result.
 *
 * A term paper is the one scope that asks the author for something structural —
 * `term`, mid or end — because a checkpoint course cannot say which of the two
 * it holds. The unique index on `(programId, term)` is what stops a program
 * ending up with two mid-terms.
 */
export async function saveAssessment(
  previous: AssessmentFormState,
  formData: FormData,
): Promise<AssessmentFormState> {
  const { actor, programSlug, programId } = await authorContext(formData);

  const scope = readScope(formData);

  const values: AssessmentInput = {
    title: text(formData, "title"),
    durationMinutes: text(formData, "durationMinutes"),
    marksPerQuestion: text(formData, "marksPerQuestion"),
    status: text(formData, "status") || "draft",
  };

  const questions = readQuestions(formData);
  if (questions === null) {
    return {
      ok: false,
      values,
      questions: previous.questions,
      errors: {
        questions: "The questions could not be read. Reload and try again.",
      },
    };
  }

  const result = validateAssessment(values, questions);
  const { questions: questionResult, ...fieldErrors } = result;

  if (hasErrors(fieldErrors) || questionResult) {
    return {
      ok: false,
      values,
      questions,
      errors: {
        ...fieldErrors,
        ...(questionResult
          ? { questions: questionResult.form ?? "Some questions still need work." }
          : {}),
      },
    };
  }

  const course = await courseFor(programId, text(formData, "courseKey"));
  const moduleDoc =
    scope === "module_test"
      ? await moduleFor(programId, text(formData, "moduleKey"))
      : null;
  const term = scope === "term_test" ? readTerm(formData) : null;

  const where = {
    programId,
    courseId: course._id,
    scope,
    moduleId: moduleDoc ? moduleDoc._id : null,
    ...(scope === "term_test" ? { term } : {}),
  };

  const existing = await Assessment.findOne(where)
    .select("_id version questions")
    .lean();

  const fields = {
    title: values.title.trim(),
    durationMinutes: Number(values.durationMinutes),
    marksPerQuestion: Number(values.marksPerQuestion),
    questions,
    status: values.status as NodeStatus,
    // Both derived from `scope`. See the note above.
    proctored: scope !== "module_test",
    countsTowardMerit: scope !== "module_test",
    term,
    updatedBy: actor.id,
  };

  if (!existing) {
    const created = await Assessment.create({ ...where, ...fields, version: 1 });

    await writeAudit(actor, {
      action: "curriculum.create",
      targetType: "Assessment",
      targetId: String(created._id),
      summary: `Created ${SCOPE_LABEL[scope]} ${fields.title}`,
      meta: { programSlug, courseKey: course.key, scope },
    });

    revalidateProgram(programSlug);
    return { ok: true, errors: {}, values, questions };
  }

  // An attempt freezes the questions it was served along with the `version`
  // they came from, and grading reads that snapshot. Bumping the version when —
  // and only when — the paper actually changed is what lets a teacher fix a
  // typo in the title without invalidating a paper someone is sitting.
  const changed = !sameQuestions(existing.questions ?? [], questions);

  await Assessment.updateOne(
    { _id: existing._id },
    changed
      ? { ...fields, version: (existing.version ?? 1) + 1 }
      : fields,
  );

  await writeAudit(actor, {
    action: "curriculum.update",
    targetType: "Assessment",
    targetId: String(existing._id),
    summary: `Updated ${SCOPE_LABEL[scope]} ${fields.title}`,
    meta: { programSlug, courseKey: course.key, scope, questionsChanged: changed },
  });

  revalidateProgram(programSlug);
  return { ok: true, errors: {}, values, questions };
}

/**
 * Are these the same questions?
 *
 * Compared field by field rather than by stringifying both sides, because the
 * two sides are not the same shape: what comes back from Mongo carries the
 * schema's defaults — `kind: "single"` — and the form posts only what the
 * author typed. Stringifying would call every save a change, bump the version
 * on a typo fix, and make the version meaningless as a signal.
 */
function sameQuestions(
  stored: readonly unknown[],
  posted: readonly QuestionInput[],
): boolean {
  const normalise = (questions: readonly unknown[]) =>
    JSON.stringify(
      questions.map((raw) => {
        const question = toAuthoredQuestion(raw);
        return {
          id: question.id,
          kind: question.kind,
          prompt: question.prompt,
          correctOptionId: question.correctOptionId,
          correctOptionIds: [...question.correctOptionIds].sort(),
          explanation: question.explanation,
          options: question.options,
          pairs: question.pairs,
        };
      }),
    );

  return normalise(stored) === normalise(posted);
}

const SCOPE_LABEL: Record<AssessmentScope, string> = {
  module_test: "module test",
  final_test: "final test",
  term_test: "term paper",
};

/**
 * Delete a test, and every attempt at it.
 *
 * A teacher may only do this while nobody has sat it — see `canDeleteWork`.
 * Once there are attempts the marks belong to students, and removing them is
 * the admin's decision; archiving does the reversible half for everyone.
 */
export async function deleteAssessment(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { actor, programSlug, programId } = await authorContext(formData);

  if (!can(actor, "curriculum.delete")) return { ok: false, error: DENIED };

  const scope = readScope(formData);

  const course = await courseFor(programId, text(formData, "courseKey"));
  const moduleDoc =
    scope === "module_test"
      ? await moduleFor(programId, text(formData, "moduleKey"))
      : null;

  const test = await Assessment.findOne({
    programId,
    courseId: course._id,
    scope,
    moduleId: moduleDoc ? moduleDoc._id : null,
  })
    .select("_id title")
    .lean();
  if (!test) notFound();

  // Counted here rather than taken from the form: the button is told the same
  // number, but the number is only true at the moment it is read.
  const attempts = await Attempt.countDocuments({ targetId: test._id });

  if (!canDeleteWork(actor, { type: "assessment", hasWork: attempts > 0 })) {
    return { ok: false, error: workDeleteDeniedReason("assessment") };
  }

  await Attempt.deleteMany({ targetId: test._id });
  await Assessment.deleteOne({ _id: test._id });

  await writeAudit(actor, {
    action: "curriculum.delete",
    targetType: "Assessment",
    targetId: String(test._id),
    summary: `Deleted ${SCOPE_LABEL[scope]} ${test.title}`,
    meta: { programSlug, courseKey: course.key, scope, attempts },
  });

  revalidateProgram(programSlug);
  redirect(
    text(formData, "returnTo") ||
      hrefsFor(formData, programSlug).course(course.key),
  );
}

/* ------------------------------- assignment ------------------------------ */

/**
 * Create or update an assignment.
 *
 * Course level, not module level, and ordered among its siblings the way every
 * other list here is — `nextOrder` for a new one, so an archived assignment
 * still holding position 2 can't have its slot handed out twice.
 */
export async function saveAssignment(
  _previous: AssignmentFormState,
  formData: FormData,
): Promise<AssignmentFormState> {
  const { actor, programSlug, programId } = await authorContext(formData);

  const mode = readMode(formData);
  const values: AssignmentInput = {
    key: text(formData, "key"),
    title: text(formData, "title"),
    brief: text(formData, "brief"),
    dueDate: text(formData, "dueDate"),
    maxMarks: text(formData, "maxMarks"),
    status: text(formData, "status") || "draft",
  };

  // A checkbox group posts one entry per ticked box, or nothing at all — which
  // is a real answer ("they picked none") and must reach the validator as one.
  const acceptedFormats = formData
    .getAll("acceptedFormats")
    .filter((value): value is string => typeof value === "string");

  // The upload field posts JSON, and JSON from a browser is a claim: everything
  // in it is re-checked against our own Cloudinary root before it is stored.
  const uploaded = parseUploadedFiles(text(formData, "briefFile"), ["pdf"]);
  const briefFile = uploaded.files[0] ?? null;

  const errors = validateAssignment(values, acceptedFormats, {
    hasBriefFile: Boolean(briefFile),
  });
  if (uploaded.error) errors.briefFile = uploaded.error;

  if (hasErrors(errors)) {
    return {
      ok: false,
      values,
      errors,
      acceptedFormats: acceptedFormats.filter(isSubmissionFormat),
      briefFile,
    };
  }

  const formats = acceptedFormats.filter(isSubmissionFormat);
  const course = await courseFor(programId, text(formData, "courseKey"));

  const fields = {
    title: values.title.trim(),
    brief: values.brief.trim(),
    briefFile,
    dueDate: toDate(values.dueDate),
    maxMarks: Number(values.maxMarks),
    acceptedFormats: formats,
    status: values.status as NodeStatus,
  };

  if (mode === "create") {
    const taken = await keyTaken(Assignment, values.key);
    if (taken) {
      return {
        ok: false,
        values,
        acceptedFormats: formats,
        briefFile,
        errors: { key: KEY_TAKEN },
      };
    }

    const order = await nextOrder(Assignment, { courseId: course._id });
    const created = await Assignment.create({
      ...fields,
      programId,
      courseId: course._id,
      key: values.key,
      order,
      createdBy: actor.id,
    });

    await writeAudit(actor, {
      action: "curriculum.create",
      targetType: "Assignment",
      targetId: String(created._id),
      summary: `Created assignment ${fields.title}`,
      meta: { programSlug, courseKey: course.key, key: values.key },
    });

    revalidateProgram(programSlug);
    redirect(hrefsFor(formData, programSlug).assignment(course.key, values.key));
  }

  const updated = await Assignment.findOneAndUpdate(
    { programId, key: text(formData, "originalKey") || values.key },
    fields,
    { returnDocument: "before" },
  )
    .select("_id briefFile")
    .lean();
  if (!updated) notFound();

  /**
   * The document that was there before, if this save replaced or removed it.
   *
   * The upload field only deletes what it uploaded itself in this sitting; a
   * file that arrived from the record is left alone, because abandoning the
   * form after deleting its bytes would leave the record pointing at nothing.
   * Once the save has landed, that reasoning inverts and the old file is ours
   * to remove.
   */
  await discardReplacedFile(updated.briefFile, briefFile);

  await writeAudit(actor, {
    action: "curriculum.update",
    targetType: "Assignment",
    targetId: String(updated._id),
    summary: `Updated assignment ${fields.title}`,
    meta: { programSlug, courseKey: course.key, key: values.key },
  });

  revalidateProgram(programSlug);
  return { ok: true, errors: {}, values, acceptedFormats: formats, briefFile };
}

/**
 * Delete an asset a save has just orphaned — an assignment brief, a module's
 * study material. Best effort: the write is already committed, and a Cloudinary
 * hiccup must not turn a saved record into an error on screen. A leftover file
 * is a tidiness problem; a failed save the teacher has to redo is not.
 */
async function discardReplacedFile(
  previous: UploadedFile | null | undefined,
  next: UploadedFile | null,
): Promise<void> {
  if (!previous?.publicId) return;
  if (previous.publicId === next?.publicId) return;

  try {
    await destroyAsset(previous.publicId, previous.resourceType);
  } catch (error) {
    console.error("[curriculum] could not delete a replaced file:", error);
  }
}

/**
 * Reclaim the study material of modules that are about to be deleted.
 *
 * Same reasoning as the videos in `deleteSubtopics`: read them before the rows
 * go, because afterwards nothing is left to say which assets to reclaim, and
 * storage is billed monthly. One at a time, and never fatal — the delete has
 * either happened or is about to, and a Cloudinary failure must not stop it.
 */
async function dropModuleMaterials(
  scope: Record<string, unknown>,
): Promise<void> {
  const owned = await Module.find({ ...scope, material: { $ne: null } })
    .select("material")
    .lean();

  for (const row of owned) {
    const file = row.material as UploadedFile | null | undefined;
    if (!file?.publicId) continue;

    try {
      await destroyAsset(file.publicId, file.resourceType);
    } catch (error) {
      console.error("[curriculum] could not delete study material:", error);
    }
  }
}

/** Delete an assignment and every hand-in against it. See `deleteAssessment`. */
export async function deleteAssignment(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { actor, programSlug, programId } = await authorContext(formData);

  if (!can(actor, "curriculum.delete")) return { ok: false, error: DENIED };

  const key = text(formData, "key");
  const assignment = await Assignment.findOne({ programId, key })
    .select("_id title courseId briefFile")
    .lean();
  if (!assignment) notFound();

  const submissions = await Submission.countDocuments({
    assignmentId: assignment._id,
  });

  if (!canDeleteWork(actor, { type: "assignment", hasWork: submissions > 0 })) {
    return { ok: false, error: workDeleteDeniedReason("assignment") };
  }

  await Submission.deleteMany({ assignmentId: assignment._id });
  await Assignment.deleteOne({ _id: assignment._id });

  // The row is gone, so the handed-out brief is an orphan. Same best-effort
  // rule as a replaced one: never let a Cloudinary failure undo the delete.
  await discardReplacedFile(assignment.briefFile, null);

  // `order` is contiguous 0..n−1 across a course's assignments, exactly as it
  // is for every other sibling set, so the survivors close the gap.
  await renumberAssignments(assignment.courseId);

  await writeAudit(actor, {
    action: "curriculum.delete",
    targetType: "Assignment",
    targetId: String(assignment._id),
    summary: `Deleted assignment ${assignment.title}`,
    meta: { programSlug, key, submissions },
  });

  revalidateProgram(programSlug);
  redirect(
    text(formData, "returnTo") || hrefsFor(formData, programSlug).program(),
  );
}

async function renumberAssignments(courseId: Types.ObjectId): Promise<void> {
  const rows = await Assignment.find({ courseId, status: { $ne: "archived" } })
    .sort({ order: 1 })
    .select("_id")
    .lean();

  if (rows.length === 0) return;

  await Assignment.bulkWrite(
    rows.map((row, index) => ({
      updateOne: { filter: { _id: row._id }, update: { $set: { order: index } } },
    })),
  );
}

/* -------------------------------- publish -------------------------------- */

/**
 * Move one node between draft, published and archived.
 *
 * Publishing a *parent* does not publish its children and never should: a
 * module published with three of its eight subtopics still drafts is exactly
 * the state a teacher wants halfway through writing it.
 */
export async function setNodeStatus(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { actor, programSlug, programId } = await authorContext(formData);

  const type = readNodeType(formData);
  const status = text(formData, "status");
  if (!isNodeStatus(status)) return { ok: false, error: "Unknown status." };

  if (type === "program") {
    if (actor.role !== "admin") return { ok: false, error: DENIED };
    await Program.updateOne({ slug: programSlug }, { status });
  } else {
    const model = modelFor(type);
    const result = await model.updateOne(
      { programId, key: text(formData, "key") },
      { status },
    );
    if (result.matchedCount === 0) notFound();
  }

  await writeAudit(actor, {
    action: `curriculum.${status}`,
    targetType: capitalise(type),
    targetId: text(formData, "key") || programSlug,
    summary: `Set ${NODE_TYPE_LABEL[type]} ${text(formData, "key") || programSlug} to ${status}`,
    meta: { programSlug },
  });

  revalidateProgram(programSlug);
  return { ok: true };
}

/* -------------------------------- reorder -------------------------------- */

/**
 * Move a node one place up or down among its siblings.
 *
 * Two tiny forms per row rather than drag-and-drop: it works without
 * JavaScript, it is reachable from a keyboard, and on a phone it is the only
 * one of the two that works at all. The write rewrites `order` across the
 * **whole** sibling set, so contiguity is an invariant rather than a hope.
 */
export async function moveNode(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { actor, programSlug, programId } = await authorContext(formData);

  if (!can(actor, "curriculum.reorder")) return { ok: false, error: DENIED };

  const type = readNodeType(formData);
  if (type === "program") return { ok: false, error: "Programs are not ordered." };

  const direction = text(formData, "direction");
  if (direction !== "up" && direction !== "down") {
    return { ok: false, error: "Unknown direction." };
  }

  const model = modelFor(type);
  const key = text(formData, "key");

  const node = await model.findOne({ programId, key }).lean();
  if (!node) notFound();

  const siblings: Sibling[] = await model
    .find({ ...siblingScope(type, node), status: { $ne: "archived" } })
    .sort({ order: 1 })
    .select("_id key order")
    .lean();

  const index = siblings.findIndex((row) => row.key === key);
  const target = direction === "up" ? index - 1 : index + 1;

  // Already at the end is not an error — the button simply isn't offered there,
  // and a stale page clicking it should do nothing rather than complain.
  if (index === -1 || target < 0 || target >= siblings.length) {
    return { ok: true };
  }

  const reordered = [...siblings];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

  await renumber(type, reordered);

  await writeAudit(actor, {
    action: "curriculum.reorder",
    targetType: capitalise(type),
    targetId: key,
    summary: `Moved ${NODE_TYPE_LABEL[type]} ${key} ${direction}`,
    meta: { programSlug },
  });

  revalidateProgram(programSlug);
  return { ok: true };
}

type Sibling = { _id: Types.ObjectId; key: string; order: number };

/**
 * Rewrite `order` — and, for modules and topics, `number` — across a list.
 *
 * `number` is derived from position rather than typed, which is why "Module 2"
 * can never end up third. One `bulkWrite`, so the list is never half-renumbered.
 */
async function renumber(
  type: Exclude<NodeType, "program">,
  ordered: { _id: Types.ObjectId }[],
): Promise<void> {
  const numbered = type === "module" || type === "topic";

  await modelFor(type).bulkWrite(
    ordered.map((row, index) => ({
      updateOne: {
        filter: { _id: row._id },
        update: { $set: numbered ? { order: index, number: index + 1 } : { order: index } },
      },
    })),
  );
}

/* --------------------------------- delete -------------------------------- */

/**
 * Delete a node and everything beneath it.
 *
 * Who may delete which level is `canDeleteNode` — an admin may delete anything,
 * a teacher only a topic or a subtopic. The button and this action read the
 * same function, so a control that renders is a control that works.
 *
 * The cascade takes student progress and attempts with it. That is the honest
 * behaviour: leaving a `SubtopicProgress` row pointing at a subtopic that no
 * longer exists would show up as a percentage nobody can account for. Content
 * that should stay accounted for is **archived**, not deleted.
 */
export async function deleteNode(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { actor, programSlug, programId } = await authorContext(formData);

  const type = readNodeType(formData);

  if (!can(actor, "curriculum.delete") || !canDeleteNode(actor, type)) {
    return {
      ok: false,
      error: `Only an admin can delete a ${NODE_TYPE_LABEL[type]}.`,
    };
  }

  const key = text(formData, "key");
  const removed = await cascade(type, programId, key);
  if (!removed) notFound();

  // Close the gap. `order` is contiguous 0..n−1 and `number` is derived from
  // it, so a delete has to rewrite the survivors exactly as a reorder does —
  // otherwise removing topic 1 leaves the remaining one still labelled "2".
  // `scope` is null only for a program, which has no siblings to renumber.
  if (removed.scope && type !== "program") {
    await renumberSiblings(type, removed.scope);
  }

  await writeAudit(actor, {
    action: "curriculum.delete",
    targetType: capitalise(type),
    targetId: key || programSlug,
    summary: `Deleted ${NODE_TYPE_LABEL[type]} ${removed.title}`,
    meta: { programSlug, key, ...removed.counts },
  });

  revalidateProgram(programSlug);

  if (type === "program") {
    revalidatePath("/admin/programs");
    redirect("/admin/programs");
  }

  redirect(text(formData, "returnTo") || hrefsFor(formData, programSlug).program());
}

type Removed = {
  title: string;
  counts: Record<string, number>;
  /** The set the node was ordered within, so the survivors can be renumbered. */
  scope: Record<string, unknown> | null;
};

/** Delete one node and its descendants. Returns what went, for the audit line. */
async function cascade(
  type: NodeType,
  programId: Types.ObjectId,
  key: string,
): Promise<Removed | null> {
  if (type === "program") {
    const program = await Program.findById(programId).select("title").lean();
    if (!program) return null;

    const counts = await deleteWhere({ programId });
    await Program.deleteOne({ _id: programId });
    return { title: program.title, counts, scope: null };
  }

  if (type === "course") {
    const course = await Course.findOne({ programId, key }).select("title").lean();
    if (!course) return null;

    const counts = await deleteWhere({ courseId: course._id });
    await Course.deleteOne({ _id: course._id });
    return { title: course.title, counts, scope: { programId } };
  }

  if (type === "module") {
    const row = await Module.findOne({ programId, key })
      .select("title courseId")
      .lean();
    if (!row) return null;

    const counts = await deleteWhere({ moduleId: row._id });
    await dropModuleMaterials({ _id: row._id });
    await Module.deleteOne({ _id: row._id });
    return { title: row.title, counts, scope: { courseId: row.courseId } };
  }

  if (type === "topic") {
    const topic = await Topic.findOne({ programId, key })
      .select("title moduleId")
      .lean();
    if (!topic) return null;

    const subtopics = await Subtopic.find({ topicId: topic._id })
      .select("_id")
      .lean();
    const ids = subtopics.map((row) => row._id);

    const counts = await deleteSubtopics(ids);
    await Topic.deleteOne({ _id: topic._id });
    return { title: topic.title, counts, scope: { moduleId: topic.moduleId } };
  }

  const subtopic = await Subtopic.findOne({ programId, key })
    .select("title topicId")
    .lean();
  if (!subtopic) return null;

  const counts = await deleteSubtopics([subtopic._id]);
  return { title: subtopic.title, counts, scope: { topicId: subtopic.topicId } };
}

/** Rewrite `order` and `number` across whatever is left of a sibling set. */
async function renumberSiblings(
  type: Exclude<NodeType, "program">,
  scope: Record<string, unknown>,
): Promise<void> {
  const siblings: Sibling[] = await modelFor(type)
    .find({ ...scope, status: { $ne: "archived" } })
    .sort({ order: 1 })
    .select("_id key order")
    .lean();

  if (siblings.length > 0) await renumber(type, siblings);
}

/**
 * Everything under a program, a course or a module.
 *
 * Scoped by a denormalised id rather than by walking the tree: every node
 * carries `programId`, and modules and below carry `courseId`, precisely so a
 * cascade is a handful of deletes instead of a recursive descent.
 */
async function deleteWhere(
  scope:
    | { programId: Types.ObjectId }
    | { courseId: Types.ObjectId }
    | { moduleId: Types.ObjectId },
): Promise<Record<string, number>> {
  const isModule = "moduleId" in scope;

  const subtopics = await Subtopic.find(scope).select("_id").lean();
  const counts = await deleteSubtopics(subtopics.map((row) => row._id));

  const assessments = await Assessment.find(scope).select("_id").lean();
  const assessmentIds = assessments.map((row) => row._id);
  if (assessmentIds.length > 0) {
    await Attempt.deleteMany({ targetId: { $in: assessmentIds } });
  }
  await Assessment.deleteMany(scope);
  counts.assessments = assessmentIds.length;

  // A module delete handles its own material in `cascade`; here the modules
  // being swept up are a course's or a program's, and theirs has to go too.
  if (!isModule) await dropModuleMaterials(scope);

  const [topics, modules] = await Promise.all([
    Topic.deleteMany(scope),
    isModule ? Promise.resolve({ deletedCount: 0 }) : Module.deleteMany(scope),
  ]);
  counts.topics = topics.deletedCount ?? 0;
  counts.modules = modules.deletedCount ?? 0;

  // Assignments are course-level, so a module delete never touches one.
  if (!isModule) {
    const assignments = await Assignment.find(scope).select("_id").lean();
    const assignmentIds = assignments.map((row) => row._id);
    if (assignmentIds.length > 0) {
      await Submission.deleteMany({ assignmentId: { $in: assignmentIds } });
    }
    await Assignment.deleteMany(scope);
    counts.assignments = assignmentIds.length;
  }

  if ("programId" in scope) {
    const courses = await Course.deleteMany(scope);
    counts.courses = courses.deletedCount ?? 0;
  }

  return counts;
}

async function deleteSubtopics(
  ids: Types.ObjectId[],
): Promise<Record<string, number>> {
  if (ids.length === 0) return { subtopics: 0 };

  // Read the videos before the rows go, because afterwards there is nothing
  // left to tell us which ones to reclaim. Storage is billed monthly, so a
  // video whose lesson was deleted is a charge that never stops on its own.
  const owned = await Subtopic.find({ _id: { $in: ids }, "video.videoId": { $ne: null } })
    .select("video")
    .lean();

  // The same argument for the documents: a PDF whose lesson was deleted is a
  // charge that never stops on its own.
  const documents = await Subtopic.find({ _id: { $in: ids }, pdf: { $ne: null } })
    .select("pdf")
    .lean();

  await Promise.all([
    SubtopicProgress.deleteMany({ subtopicId: { $in: ids } }),
    Attempt.deleteMany({ targetId: { $in: ids } }),
  ]);
  await Subtopic.deleteMany({ _id: { $in: ids } });

  // After the delete, and one at a time: this can be a whole course's worth of
  // lessons, and a burst of parallel deletes is how you get rate-limited.
  for (const row of owned) {
    if (row.video?.videoId) await dropVideo(row.video.videoId, undefined);
  }
  for (const row of documents) {
    await discardReplacedFile((row as { pdf?: UploadedFile | null }).pdf, null);
  }

  return { subtopics: ids.length };
}

/* -------------------------------- context -------------------------------- */

const DENIED = "You cannot change this program's content.";
const KEY_TAKEN = "That key is already in use. Keys must be unique.";

/**
 * The three checks every content mutation starts with, in the house order.
 *
 * `requireRole("teacher")` admits teachers and admins and nobody else — a
 * program manager reaching this is redirected home before anything is read.
 */
async function authorContext(formData: FormData): Promise<{
  actor: CurrentUser;
  programSlug: string;
  programId: Types.ObjectId;
}> {
  const actor = await requireRole("teacher");

  if (!can(actor, "curriculum.author")) notFound();

  const programSlug = text(formData, "programSlug");
  if (!programSlug) notFound();

  assertScope(actor, { program: programSlug });

  await connectToDatabase();

  const program = await Program.findOne({ slug: programSlug })
    .select("_id")
    .lean();
  if (!program) notFound();

  return { actor, programSlug, programId: program._id };
}

async function courseFor(programId: Types.ObjectId, key: string) {
  const course = await Course.findOne({ programId, key })
    .select("_id key")
    .lean();
  if (!course) notFound();
  return course;
}

async function moduleFor(programId: Types.ObjectId, key: string) {
  const row = await Module.findOne({ programId, key }).select("_id key").lean();
  if (!row) notFound();
  return row;
}

async function topicFor(programId: Types.ObjectId, key: string) {
  const topic = await Topic.findOne({ programId, key }).select("_id key").lean();
  if (!topic) notFound();
  return topic;
}

/** Which set a node is ordered within. */
function siblingScope(
  type: Exclude<NodeType, "program">,
  node: { courseId?: unknown; moduleId?: unknown; topicId?: unknown; programId?: unknown },
): Record<string, unknown> {
  if (type === "course") return { programId: node.programId };
  if (type === "module") return { courseId: node.courseId };
  if (type === "topic") return { moduleId: node.moduleId };
  return { topicId: node.topicId };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function modelFor(type: Exclude<NodeType, "program">): any {
  if (type === "course") return Course;
  if (type === "module") return Module;
  if (type === "topic") return Topic;
  return Subtopic;
}

/* --------------------------------- helpers ------------------------------- */

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function readMode(formData: FormData): "create" | "edit" {
  return text(formData, "mode") === "edit" ? "edit" : "create";
}

/** Which paper this is. Mirrors `readNodeType`: an unknown value is a 404. */
function readScope(formData: FormData): AssessmentScope {
  const value = text(formData, "scope");
  if (
    value === "module_test" ||
    value === "final_test" ||
    value === "term_test"
  ) {
    return value;
  }
  notFound();
}

/**
 * Which term paper this is — the one thing about a term paper the author does
 * choose, because a checkpoint course does not say whether it is the mid or the
 * end. Anything else, including an unrecognised value, is a 404 rather than a
 * silent `null` that would write a term paper belonging to no term.
 */
function readTerm(formData: FormData): "mid" | "end" {
  const value = text(formData, "term");
  if (value === "mid" || value === "end") return value;
  notFound();
}

function readNodeType(formData: FormData): NodeType {
  const value = text(formData, "type");
  if (value in NODE_TYPE_LABEL) return value as NodeType;
  notFound();
}

/**
 * The posted question list, narrowed.
 *
 * `null` means the payload was unreadable, which is not a validation failure.
 * Everything else goes through `toAuthoredQuestion`, so what reaches the
 * validator and the database has exactly the fields a question has — a post
 * carrying extra keys, a missing `pairs`, or a `kind` nobody has heard of
 * cannot write itself into an `Assessment`. `choiceOrder` is dropped: it
 * belongs to an attempt's frozen shuffle, never to the paper.
 */
function readQuestions(formData: FormData): QuestionInput[] | null {
  const raw = text(formData, "questions");
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    return parsed.map((entry) => {
      const question = toAuthoredQuestion(entry);
      return {
        id: question.id,
        kind: question.kind,
        prompt: question.prompt,
        options: question.options,
        correctOptionId: question.correctOptionId,
        correctOptionIds: question.correctOptionIds,
        pairs: question.pairs,
        explanation: question.explanation,
      };
    });
  } catch {
    return null;
  }
}

function toDate(value: string): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

/**
 * The `order` a new sibling gets: one past the highest there is.
 *
 * Not a count. An archived sibling still holds its position and is skipped by
 * the renumbering, so counting the set would hand a new node an `order` another
 * one already has — and two nodes at the same position order arbitrarily.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function nextOrder(model: any, scope: Record<string, unknown>): Promise<number> {
  const last = await model
    .findOne(scope)
    .sort({ order: -1 })
    .select("order")
    .lean();

  return last ? (last.order ?? -1) + 1 : 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function keyTaken(model: any, key: string): Promise<boolean> {
  return Boolean(await model.exists({ key }));
}

function hrefsFor(formData: FormData, programSlug: string) {
  return text(formData, "area") === "admin"
    ? adminHrefs(programSlug)
    : teacherHrefs(programSlug);
}

/** Both areas render the same tree, so both are stale after any write. */
function revalidateProgram(programSlug: string): void {
  revalidatePath(`/admin/programs/${programSlug}`, "layout");
  revalidatePath(`/teacher/programs/${programSlug}`, "layout");
  revalidatePath(`/manager/programs/${programSlug}`, "layout");
}

function capitalise(type: NodeType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

async function audit(
  actor: CurrentUser,
  type: NodeType,
  verb: "create" | "update",
  targetId: string,
  title: string,
  meta: Record<string, unknown>,
): Promise<void> {
  await writeAudit(actor, {
    action: `curriculum.${verb}`,
    targetType: capitalise(type),
    targetId,
    summary: `${verb === "create" ? "Created" : "Updated"} ${NODE_TYPE_LABEL[type]} ${title}`,
    meta,
  });
}
