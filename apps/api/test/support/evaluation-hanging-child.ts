// Deliberately inert subprocess for supervisor cleanup tests. No extraction,
// provider imports, documents, sockets or configurable commands.
process.on('message', () => {});
process.send?.({ type: 'ready' });
