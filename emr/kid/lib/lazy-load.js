/**
 * Lazy loading utility for prescriptions using Intersection Observer
 * Prevents loading prescription previews until they're visible in viewport
 * Reduces unnecessary reads and improves perceived performance
 */

export class PrescriptionLazyLoader {
  constructor(options = {}) {
    this.loadingPrescriptions = new Map();
    this.loadedPrescriptions = new Set();
    this.preloadDelay = options.preloadDelay ?? 0; // no artificial delay - previews are usually already on screen
    this.preloadMargin = options.preloadMargin || '100px'; // Start loading 100px before visible
    this.maxConcurrentLoads = options.maxConcurrentLoads || 5;

    this.observer = new IntersectionObserver(
      (entries) => this.handleIntersection(entries),
      {
        rootMargin: this.preloadMargin,
        threshold: 0.01
      }
    );

    this.loadQueue = [];
    this.activeLoads = 0;
  }

  /**
   * Observe a prescription element for lazy loading
   */
  observe(element, loadFn) {
    if (!element || typeof loadFn !== 'function') return;

    element.dataset.lazyLoad = 'pending';
    this.observer.observe(element);
    element._lazyLoadFn = loadFn;
  }

  /**
   * Stop observing an element
   */
  unobserve(element) {
    if (element) {
      this.observer.unobserve(element);
      delete element._lazyLoadFn;
    }
  }

  /**
   * Handle intersection changes - queue loads for visible items
   */
  handleIntersection(entries) {
    entries.forEach((entry) => {
      if (entry.isIntersecting && entry.target.dataset.lazyLoad === 'pending') {
        const prescriptionId = entry.target.dataset.prescriptionId;
        if (!this.loadedPrescriptions.has(prescriptionId)) {
          this.queueLoad(entry.target);
        }
      }
    });
  }

  /**
   * Queue a prescription for loading
   */
  queueLoad(element) {
    const prescriptionId = element.dataset.prescriptionId;
    if (this.loadingPrescriptions.has(prescriptionId)) return;

    this.loadQueue.push(element);
    this.processQueue();
  }

  /**
   * Process queued items, respecting concurrency limit
   */
  async processQueue() {
    while (this.loadQueue.length > 0 && this.activeLoads < this.maxConcurrentLoads) {
      const element = this.loadQueue.shift();
      this.activeLoads++;

      await this.loadPrescription(element);

      this.activeLoads--;
    }
  }

  /**
   * Load a single prescription with debounce
   */
  async loadPrescription(element) {
    const prescriptionId = element.dataset.prescriptionId;

    if (!element._lazyLoadFn) return;

    // Debounce: delay load slightly to batch requests
    await new Promise((resolve) => setTimeout(resolve, this.preloadDelay));

    this.loadingPrescriptions.set(prescriptionId, true);
    element.dataset.lazyLoad = 'loading';

    try {
      await element._lazyLoadFn();
      this.loadedPrescriptions.add(prescriptionId);
      element.dataset.lazyLoad = 'loaded';
    } catch (error) {
      console.error(`Failed to lazy load prescription ${prescriptionId}:`, error);
      element.dataset.lazyLoad = 'error';
    } finally {
      this.loadingPrescriptions.delete(prescriptionId);
      this.processQueue();
    }
  }

  /**
   * Disconnect observer and clear all state
   */
  disconnect() {
    this.observer.disconnect();
    this.loadingPrescriptions.clear();
    this.loadedPrescriptions.clear();
    this.loadQueue = [];
  }
}
