import { StaffLayout } from "@/components/staff/StaffLayout";

export default function AdminAreaLayout({ children }: LayoutProps<"/admin">) {
  return (
    <StaffLayout area="admin" roles={["admin"]}>
      {children}
    </StaffLayout>
  );
}
