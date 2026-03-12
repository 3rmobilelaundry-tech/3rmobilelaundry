const sseClients = new Set();

function addClient(res, userId) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Attach userId to the response object for tracking
  res.userId = userId;

  sseClients.add(res);

  res.on('close', () => {
    sseClients.delete(res);
  });
}

function broadcast(event, payload, targetUserId = null) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    // If targetUserId is specified, only send to that user
    if (targetUserId && String(res.userId) !== String(targetUserId)) {
      continue;
    }
    try {
      res.write(data);
    } catch (e) {
      console.error('SSE Broadcast Error:', e);
      sseClients.delete(res);
    }
  }
}

module.exports = { addClient, broadcast };
