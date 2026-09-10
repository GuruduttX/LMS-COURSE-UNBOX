"use client";

/**
 * The controls that act on one node: publish, move, delete.
 *
 * Three separate forms rather than one, because they are three unrelated
 * decisions and a single Save that also reordered things would be a surprise.
 * Each is its own `useActionState` so a failed delete cannot make a successful
 * publish look like it failed.
 *
 * ## Why delete asks, and what it says
 *
 * The confirm names the node **and what goes with it** — deleting a module
 * takes its topics, subtopics, test and every student's progress through them.
 * A confirm that only says "are you sure?" is a click-through; one that says
 * what is lost is a decision.
 *
 * ## Why a missing Delete button explains itself
 *
 * A teacher may delete a topic or a subtopic and nothing above. Rather than
 * hiding the control silently, the row says who can and points at archiving,
 * which does the reversible half of the same job and is open to everyone.
 * `canDeleteNode` is the same function the action checks, so a control that
 * renders is a control that works.
 */
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { useConfirmSubmit } from "@/components/ui/ConfirmDialog";
import { Select } from "@/components/ui/Field";
import {
  deleteAssessment,
  deleteAssignment,
  deleteNode,
  moveNode,
  setNodeStatus,
} from "@/lib/actions/curriculum";
import {
  EMPTY_ACTION_STATE,
  type ActionState,
} from "@/lib/actions/curriculum-state";
import {
  canDeleteNode,
  canDeleteWork,
  deleteDeniedReason,
  NODE_CASCADE,
  NODE_TYPE_LABEL,
  WORK_CASCADE,
  WORK_TYPE_LABEL,
  workDeleteDeniedReason,
  type NodeType,
} from "@/lib/curriculum/authoring";
import type { AssessmentScope } from "@/lib/data/staff-work";
import type { Role } from "@/lib/auth/roles";
import { NODE_STATUSES, type NodeStatus } from "@/lib/curriculum/rules";

/**
 * The two levels whose delete dialog also makes you tick a box.
 *
 * Everything below a course belongs to one class's worth of work; a program or
 * a course is the whole thing, and its delete is the one that cannot be walked
 * back from a backup anybody in the building has.
 */
const NEEDS_ACKNOWLEDGEMENT = new Set<NodeType>(["program", "course"]);

const STATUS_LABEL: Record<NodeStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

export type NodeRef = {
  area: "admin" | "teacher";
  programSlug: string;
  type: NodeType;
  /** The node's stable key. Empty for a program, which is named by its slug. */
  nodeKey: string;
  title: string;
};

/** The bar at the top of a node's own screen. */
export function NodeActions({
  node,
  status,
  role,
  returnTo,
}: {
  node: NodeRef;
  status: NodeStatus;
  role: Role;
  /** Where to land after a delete — the parent, which still exists. */
  returnTo: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 shadow-sm">
      <StatusForm node={node} status={status} />
      <DeleteNodeButton node={node} role={role} returnTo={returnTo} />
    </div>
  );
}

function StatusForm({ node, status }: { node: NodeRef; status: NodeStatus }) {
  const [state, action, pending] = useActionState(
    setNodeStatus,
    EMPTY_ACTION_STATE,
  );

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <Context node={node} />

      <label className="text-sm font-medium text-ink-700" htmlFor="node-status">
        Visibility
      </label>
      <Select
        id="node-status"
        name="status"
        defaultValue={status}
        className="w-40"
      >
        {NODE_STATUSES.map((option) => (
          <option key={option} value={option}>
            {STATUS_LABEL[option]}
          </option>
        ))}
      </Select>

      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? "Applying…" : "Apply"}
      </Button>

      <Feedback state={state} />
    </form>
  );
}

/**
 * Delete, on its own.
 *
 * Exported because a topic has no screen of its own — it is a heading inside
 * its module — so its delete lives in that heading rather than in a node bar.
 */
export function DeleteNodeButton({
  node,
  role,
  returnTo,
}: {
  node: NodeRef;
  role: Role;
  returnTo: string;
}) {
  const [state, action, pending] = useActionState(
    deleteNode,
    EMPTY_ACTION_STATE,
  );

  const { onSubmit, dialog } = useConfirmSubmit({
    title: `Delete the ${NODE_TYPE_LABEL[node.type]} “${node.title}”?`,
    message: `This also removes ${NODE_CASCADE[node.type]}. It cannot be undone — archive it instead if you only want it hidden.`,
    confirmLabel: `Delete ${NODE_TYPE_LABEL[node.type]}`,
    // A program or a course is the top of a tree — one click takes years of
    // student progress with it, so that one asks for a tick as well.
    acknowledge: NEEDS_ACKNOWLEDGEMENT.has(node.type)
      ? `I understand this permanently deletes “${node.title}” and everything inside it, for every student.`
      : undefined,
  });

  if (!canDeleteNode({ role }, node.type)) {
    return (
      <p className="max-w-sm text-xs text-ink-500">
        {deleteDeniedReason(node.type)}
      </p>
    );
  }

  return (
    <form
      action={action}
      onSubmit={onSubmit}
      className="flex items-center gap-2"
    >
      {dialog}
      <Context node={node} />
      <input type="hidden" name="returnTo" value={returnTo} />

      <Feedback state={state} />

      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        <Trash2 size={14} aria-hidden />
        {pending ? "Deleting…" : `Delete ${NODE_TYPE_LABEL[node.type]}`}
      </Button>
    </form>
  );
}

/**
 * Up and down, next to a row in a list.
 *
 * Two one-button forms rather than drag-and-drop: they work without JavaScript,
 * they are reachable from a keyboard, and on a phone they are the only one of
 * the two that works at all. The action rewrites the whole sibling set, so the
 * numbering follows the position without anyone maintaining it.
 */
export function MoveButtons({
  node,
  first,
  last,
}: {
  node: NodeRef;
  first: boolean;
  last: boolean;
}) {
  return (
    <div className="flex flex-col justify-center gap-1">
      <MoveButton node={node} direction="up" disabled={first} />
      <MoveButton node={node} direction="down" disabled={last} />
    </div>
  );
}

/**
 * Delete a test or an assignment.
 *
 * Separate from `DeleteNodeButton` because the rule is a different one. For a
 * level of the tree it is the node type that decides; for graded work it is
 * whether a student has already sat or handed in — see `canDeleteWork`. The
 * confirm therefore names that number, since "3 hand-ins" is the fact that
 * makes this a decision rather than tidying up.
 */
export function DeleteWorkButton({
  work,
  role,
  title,
  count,
  returnTo,
}: {
  work: WorkRef;
  role: Role;
  title: string;
  /** Attempts sat, or hand-ins made. Zero is what puts this in a teacher's reach. */
  count: number;
  returnTo: string;
}) {
  const [state, action, pending] = useActionState(
    work.type === "assessment" ? deleteAssessment : deleteAssignment,
    EMPTY_ACTION_STATE,
  );

  const label = WORK_TYPE_LABEL[work.type];

  const done =
    count === 0
      ? "Nobody has worked on it yet."
      : `This also removes ${WORK_CASCADE[work.type]} — ${count} so far.`;

  const { onSubmit, dialog } = useConfirmSubmit({
    title: `Delete the ${label} “${title}”?`,
    message: `${done} It cannot be undone — archive it instead if you only want it hidden.`,
    confirmLabel: `Delete ${label}`,
  });

  if (!canDeleteWork({ role }, { type: work.type, hasWork: count > 0 })) {
    return (
      <p className="max-w-sm text-xs text-ink-500">
        {workDeleteDeniedReason(work.type)}
      </p>
    );
  }

  return (
    <form
      action={action}
      onSubmit={onSubmit}
      className="flex items-center gap-2"
    >
      {dialog}
      <input type="hidden" name="area" value={work.area} />
      <input type="hidden" name="programSlug" value={work.programSlug} />
      {work.type === "assessment" ? (
        <>
          <input type="hidden" name="courseKey" value={work.courseKey} />
          <input type="hidden" name="scope" value={work.scope} />
          {work.moduleKey ? (
            <input type="hidden" name="moduleKey" value={work.moduleKey} />
          ) : null}
        </>
      ) : (
        <input type="hidden" name="key" value={work.assignmentKey} />
      )}
      <input type="hidden" name="returnTo" value={returnTo} />

      <Feedback state={state} />

      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        <Trash2 size={14} aria-hidden />
        {pending ? "Deleting…" : `Delete ${label}`}
      </Button>
    </form>
  );
}

export type WorkRef =
  | {
      type: "assessment";
      area: "admin" | "teacher";
      programSlug: string;
      courseKey: string;
      scope: AssessmentScope;
      /** Set for a module test only. */
      moduleKey?: string;
    }
  | {
      type: "assignment";
      area: "admin" | "teacher";
      programSlug: string;
      assignmentKey: string;
    };

function MoveButton({
  node,
  direction,
  disabled,
}: {
  node: NodeRef;
  direction: "up" | "down";
  disabled: boolean;
}) {
  const [, action, pending] = useActionState(moveNode, EMPTY_ACTION_STATE);
  const Icon = direction === "up" ? ArrowUp : ArrowDown;

  return (
    <form action={action}>
      <Context node={node} />
      <input type="hidden" name="direction" value={direction} />
      <button
        type="submit"
        disabled={disabled || pending}
        aria-label={`Move ${node.title} ${direction}`}
        className="rounded-md border border-border bg-surface p-1.5 text-ink-600 transition-colors hover:border-border-strong hover:text-ink-900 disabled:opacity-30"
      >
        <Icon size={14} aria-hidden />
      </button>
    </form>
  );
}

function Context({ node }: { node: NodeRef }) {
  return (
    <>
      <input type="hidden" name="area" value={node.area} />
      <input type="hidden" name="programSlug" value={node.programSlug} />
      <input type="hidden" name="type" value={node.type} />
      <input type="hidden" name="key" value={node.nodeKey} />
    </>
  );
}

function Feedback({ state }: { state: ActionState }) {
  if (!state.error) return null;
  return (
    <span role="alert" className="text-sm text-danger-700">
      {state.error}
    </span>
  );
}
