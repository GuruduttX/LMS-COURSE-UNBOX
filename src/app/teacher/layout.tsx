import { StaffLayout } from "@/components/staff/StaffLayout";

export default function TeacherAreaLayout({ children }: LayoutProps<"/teacher">) {
  return (
    <StaffLayout area="teacher" roles={["teacher"]}>
      {children}
    </StaffLayout>
  );
}
