import { Router, Request, Response } from 'express';

export const assistantRouter = Router();

assistantRouter.get('/stream', (req: Request, res: Response) => {
  const query = (req.query.q as string || '').trim();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  res.flushHeaders();

  const responseText = query
    ? `Analysis for query: "${query}". Microservice fleet health is currently monitored across 2,000 services. Check payments and identity clusters for latency spikes.`
    : 'Ops Assistant is ready to help diagnose microservice incidents.';

  const words = responseText.split(' ');
  let idx = 0;

  const interval = setInterval(() => {
    if (idx < words.length) {
      res.write(`event: token\ndata: ${JSON.stringify({ text: words[idx] + ' ' })}\n\n`);
      idx++;
    } else {
      res.write(`event: done\ndata: {}\n\n`);
      clearInterval(interval);
      res.end();
    }
  }, 60);

  req.on('close', () => {
    clearInterval(interval);
  });
});
