/**
 * Local-only performance monitor. Logs Core Web Vitals and page-load timing
 * to the browser console. Nothing here makes a network request or sends
 * data anywhere — it only reads from the browser's own Performance APIs.
 */

function roundMs(value) {
  return Math.round(value * 100) / 100;
}

function logMetric(name, value, unit = 'ms') {
  console.log(`%c[perf] ${name}`, 'color:#166534;font-weight:600;', `${roundMs(value)}${unit}`);
}

export function startPerfMonitor(pageLabel = document.title) {
  if (typeof PerformanceObserver === 'undefined') {
    return;
  }

  console.groupCollapsed(`%c[perf] ${pageLabel}`, 'color:#166534;font-weight:700;');

  try {
    const paintEntries = performance.getEntriesByType('paint');
    const fcp = paintEntries.find((entry) => entry.name === 'first-contentful-paint');
    if (fcp) {
      logMetric('First Contentful Paint', fcp.startTime);
    }
  } catch (error) {
    console.warn('[perf] paint timing unavailable:', error.message);
  }

  const logNavigationTiming = () => {
    try {
      const [navEntry] = performance.getEntriesByType('navigation');
      if (navEntry) {
        logMetric('Time to First Byte', navEntry.responseStart);
        logMetric('DOM Content Loaded', navEntry.domContentLoadedEventEnd);
        logMetric('Page Load Complete', navEntry.loadEventEnd);
      }
    } catch (error) {
      console.warn('[perf] navigation timing unavailable:', error.message);
    }
  };

  // domContentLoadedEventEnd/loadEventEnd stay 0 until those events actually
  // finish dispatching. loadEventEnd specifically isn't finalized until after
  // all `load` listeners (including this one) have run, so defer one tick.
  const logNavigationTimingNextTick = () => setTimeout(logNavigationTiming, 0);
  if (document.readyState === 'complete') {
    logNavigationTimingNextTick();
  } else {
    window.addEventListener('load', logNavigationTimingNextTick, { once: true });
  }

  try {
    let lcpValue = null;
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      if (lastEntry) {
        lcpValue = lastEntry.startTime;
      }
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

    // LCP stops updating once the user interacts or the page is hidden.
    const finalizeLcp = () => {
      lcpObserver.disconnect();
      if (lcpValue !== null) {
        logMetric('Largest Contentful Paint', lcpValue);
      }
      console.groupEnd();
    };
    ['keydown', 'click', 'visibilitychange'].forEach((eventName) => {
      window.addEventListener(eventName, finalizeLcp, { once: true, capture: true });
    });
  } catch (error) {
    console.warn('[perf] LCP observer unavailable:', error.message);
    console.groupEnd();
  }

  try {
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
        }
      }
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });

    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        logMetric('Cumulative Layout Shift', clsValue, '');
        clsObserver.disconnect();
      }
    }, { once: true });
  } catch (error) {
    console.warn('[perf] CLS observer unavailable:', error.message);
  }

  try {
    const inpObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 100) {
          logMetric(`Slow interaction (${entry.name})`, entry.duration);
        }
      }
    });
    inpObserver.observe({ type: 'event', buffered: true, durationThreshold: 100 });
  } catch (error) {
    // 'event' timing entries aren't supported in every browser; safe to ignore.
  }
}

/**
 * Measure a labeled span of app-specific work (e.g. "patient list render")
 * and log it to console. Usage:
 *   const done = markAppTiming('patient list render');
 *   ...do work...
 *   done();
 */
export function markAppTiming(label) {
  const start = performance.now();
  return () => {
    logMetric(label, performance.now() - start);
  };
}
