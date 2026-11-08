import { useLanguage } from "./dashboard-language";

const steps = ["Pair awaiting customisation orders", "Approve manual orders", "Choose New Orders", "Upload shipping labels", "Packing slips + shipping labels", "Download ZIP"];

export function DailyProductionProgress({ step }: { step: number }) {
  const { t } = useLanguage();
  return <ol className="batch-progress" aria-label={t("Daily Production progress")} style={{gridTemplateColumns:"repeat(auto-fit,minmax(135px,1fr))"}}>
    {steps.map((label,index) => <li key={label} className={step > index + 1 ? "done" : step === index + 1 ? "current" : ""} aria-current={step === index + 1 ? "step" : undefined}><span>{index + 1}</span>{t(label)}</li>)}
  </ol>;
}
