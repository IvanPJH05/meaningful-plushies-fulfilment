import { CustomisationForm } from "./customisation-form";

export default async function CustomisePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CustomisationForm token={token} />;
}
