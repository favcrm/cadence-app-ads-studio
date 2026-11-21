import { LocaleTextProvider } from "@cadence/screen-ui";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { zhHK } from "./localeCatalog";

type Locale = "en" | "zh-TW";
type LocaleValue = {
  locale: Locale;
  canvas: boolean;
  t: (english: string) => string;
};

const identity = (english: string) => english;
const LocaleContext = createContext<LocaleValue>({
  locale: "en",
  canvas: false,
  t: identity,
});

export function AdsLocaleProvider({
  locale,
  canvas = false,
  children,
}: {
  locale: Locale;
  canvas?: boolean;
  children: ReactNode;
}) {
  const value = useMemo<LocaleValue>(
    () => ({
      locale,
      canvas,
      t: locale === "zh-TW" ? (english) => zhHK[english] ?? english : identity,
    }),
    [locale, canvas],
  );
  return (
    <LocaleContext.Provider value={value}>
      <LocaleTextProvider value={value.t}>{children}</LocaleTextProvider>
    </LocaleContext.Provider>
  );
}

export const useLocale = () => useContext(LocaleContext);
