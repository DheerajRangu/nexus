import type { Lang } from "../shared/contract";

export type ExplanationKey =
  | "coordinating"
  | "delayed"
  | "locationConfirmed"
  | "assigned"
  | "approaching"
  | "atPickup"
  | "travelling"
  | "arrived"
  | "completed"
  | "cancelled"
  | "correction";

const copy: Record<Lang, Record<ExplanationKey, string>> = {
  en: {
    coordinating: "A vehicle has not been assigned yet.",
    delayed: "Dispatch is taking longer than usual. Your request is still being coordinated.",
    locationConfirmed: "The pickup point is confirmed. Dispatch is still being coordinated.",
    assigned: "An ambulance has accepted this request.",
    approaching: "The assigned ambulance is travelling to the confirmed pickup point.",
    atPickup: "The ambulance is at the confirmed pickup point.",
    travelling: "Travelling to the confirmed hospital.",
    arrived: "The ambulance has arrived at the hospital.",
    completed: "This response is complete. You can close this page.",
    cancelled: "The control room cancelled this request.",
    correction:
      "The pickup point was updated. The hospital destination was not changed.",
  },
  te: {
    coordinating: "ఇంకా వాహనం కేటాయించబడలేదు.",
    delayed: "పంపిణీ సాధారణం కంటే ఎక్కువ సమయం తీసుకుంటోంది. మీ అభ్యర్థన ఇంకా సమన్వయం చేయబడుతోంది.",
    locationConfirmed: "పికప్ స్థానం నిర్ధారించబడింది. పంపిణీ ఇంకా సమన్వయం చేయబడుతోంది.",
    assigned: "ఒక అంబులెన్స్ ఈ అభ్యర్థనను అంగీకరించింది.",
    approaching: "కేటాయించిన అంబులెన్స్ నిర్ధారించిన పికప్ స్థానానికి వెళ్తోంది.",
    atPickup: "అంబులెన్స్ నిర్ధారించిన పికప్ స్థానం వద్ద ఉంది.",
    travelling: "నిర్ధారించిన ఆసుపత్రికి వెళ్తున్నారు.",
    arrived: "అంబులెన్స్ ఆసుపత్రికి చేరుకుంది.",
    completed: "ఈ స్పందన పూర్తయింది. మీరు ఈ పేజీని మూసివేయవచ్చు.",
    cancelled: "కంట్రోల్ రూమ్ ఈ అభ్యర్థనను రద్దు చేసింది.",
    correction: "పికప్ స్థానం నవీకరించబడింది. ఆసుపత్రి గమ్యం మారలేదు.",
  },
  hi: {
    coordinating: "अभी कोई वाहन नियुक्त नहीं हुआ है।",
    delayed: "डिस्पैच में सामान्य से अधिक समय लग रहा है। आपका अनुरोध अभी भी समन्वित किया जा रहा है।",
    locationConfirmed: "पिकअप स्थान की पुष्टि हो गई है। डिस्पैच अभी भी समन्वित किया जा रहा है।",
    assigned: "एक एम्बुलेंस ने यह अनुरोध स्वीकार कर लिया है।",
    approaching: "नियुक्त एम्बुलेंस पुष्टि किए गए पिकअप स्थान की ओर जा रही है।",
    atPickup: "एम्बुलेंस पुष्टि किए गए पिकअप स्थान पर है।",
    travelling: "पुष्टि किए गए अस्पताल की ओर यात्रा जारी है।",
    arrived: "एम्बुलेंस अस्पताल पहुँच गई है।",
    completed: "यह प्रतिक्रिया पूरी हो गई है। आप यह पृष्ठ बंद कर सकते हैं।",
    cancelled: "नियंत्रण कक्ष ने यह अनुरोध रद्द कर दिया है।",
    correction: "पिकअप स्थान अपडेट किया गया। अस्पताल का गंतव्य नहीं बदला।",
  },
};

export function explain(lang: Lang, key: ExplanationKey): string {
  return copy[lang][key];
}

export function negotiateLanguage(header: string | undefined): Lang {
  const value = (header ?? "").toLowerCase();
  if (value.includes("te")) return "te";
  if (value.includes("hi")) return "hi";
  return "en";
}
