// Test-only CPU stall; production never selects this entry point.
export {};
while (true) {
  /* intentionally blocks until terminate() */
}
