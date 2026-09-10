import { StaffLayout } from "@/components/staff/StaffLayout";

export default function ManagerAreaLayout({ children }: LayoutProps<"/manager">) {
  return (
    <StaffLayout area="manager" roles={["program_manager"]}>
      {children}
    </StaffLayout>
  );
}
