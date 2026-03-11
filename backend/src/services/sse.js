const sseClients = new Set();

function addClient(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);

  res.on('close', () => {
    sseClients.delete(res);
  });
}

function broadcast(event, payload) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(data);
    } catch (e) {
      console.error('SSE Broadcast Error:', e);
      sseClients.delete(res);
    }
  }
}

module.exports = { addClient, broadcast };
