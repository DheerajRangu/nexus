import { CitizenExperience } from "./CitizenExperience";
import { useTracking } from "./useTracking";

export function App(props: { initialToken: string | null; startDemo: boolean }) {
  const tracking = useTracking(props);
  return (
    <CitizenExperience
      model={tracking.model}
      lang={tracking.lang}
      onLang={tracking.setLang}
      onSubmitLocation={tracking.submitLocation}
      onSearch={tracking.search}
      onReverse={tracking.reverse}
      onContact={tracking.contact}
      onDemoStep={tracking.demoStep}
      onRetry={tracking.retry}
    />
  );
}
