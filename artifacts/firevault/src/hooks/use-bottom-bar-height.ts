import { useEffect } from "react";

const ATTRIBUUT = "data-bottom-bar";
const CSS_VAR = "--bottom-bar-hoogte";

function bereken() {
  const elementen = document.querySelectorAll<HTMLElement>(`[${ATTRIBUUT}]`);
  let maxHoogte = 0;
  elementen.forEach((el) => {
    const hoogte = el.getBoundingClientRect().height;
    if (hoogte > maxHoogte) maxHoogte = hoogte;
  });
  document.documentElement.style.setProperty(CSS_VAR, `${maxHoogte}px`);
}

export function useBottomBarHeight() {
  useEffect(() => {
    bereken();

    const observer = new ResizeObserver(() => bereken());

    function observeer() {
      const elementen = document.querySelectorAll<HTMLElement>(`[${ATTRIBUUT}]`);
      elementen.forEach((el) => observer.observe(el));
    }

    observeer();

    const mutationObserver = new MutationObserver(() => {
      observer.disconnect();
      observeer();
      bereken();
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: [ATTRIBUUT] });

    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
      document.documentElement.style.removeProperty(CSS_VAR);
    };
  }, []);
}
