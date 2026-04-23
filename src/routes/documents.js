const { Router } = require('express');
const { z } = require('zod');
const multer = require('multer');
const { supabaseAdmin } = require('../config/supabase');
const { authMiddleware, requireRole } = require('../middleware/auth');
const ragService = require('../services/ragService');

const router = Router();
router.use(authMiddleware);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter(_, file, cb) {
    const allowed = ['application/pdf', 'text/plain', 'text/markdown'];
    cb(null, allowed.includes(file.mimetype));
  },
});

router.get('/', async (req, res) => {
  const query = supabaseAdmin
    .from('documents')
    .select('id, name, type, status, chunk_count, created_at, updated_at')
    .eq('organization_id', req.organizationId)
    .order('created_at', { ascending: false });

  if (req.query.agent_id) query.eq('agent_id', req.query.agent_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/:id', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('id', req.params.id)
    .eq('organization_id', req.organizationId)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Document not found' });
  res.json(data);
});

// Upload a file (PDF or TXT)
router.post('/upload', requireRole('owner', 'admin', 'member'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded or invalid type' });

  const schema = z.object({ agent_id: z.string().uuid(), name: z.string().min(1).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { agent_id, name } = parsed.data;

  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('id')
    .eq('id', agent_id)
    .eq('organization_id', req.organizationId)
    .single();

  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const ext = req.file.originalname.split('.').pop().toLowerCase();
  const docType = ext === 'pdf' ? 'pdf' : 'txt';
  const storagePath = `${req.organizationId}/${agent_id}/${Date.now()}_${req.file.originalname}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from('agent-documents')
    .upload(storagePath, req.file.buffer, { contentType: req.file.mimetype });

  if (uploadError) return res.status(500).json({ error: uploadError.message });

  const { data: doc, error: docError } = await supabaseAdmin
    .from('documents')
    .insert({
      agent_id,
      organization_id: req.organizationId,
      name: name || req.file.originalname,
      type: docType,
      storage_path: storagePath,
      status: 'processing',
    })
    .select()
    .single();

  if (docError) return res.status(500).json({ error: docError.message });

  // Process in background
  ragService.processDocument(doc.id).catch((err) =>
    console.error(`Document processing failed [${doc.id}]:`, err)
  );

  res.status(202).json({ ...doc, message: 'Processing started' });
});

// Add a URL document
router.post('/url', requireRole('owner', 'admin', 'member'), async (req, res) => {
  const schema = z.object({
    agent_id: z.string().uuid(),
    url: z.string().url(),
    name: z.string().min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { agent_id, url, name } = parsed.data;

  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('id')
    .eq('id', agent_id)
    .eq('organization_id', req.organizationId)
    .single();

  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const { data: doc, error } = await supabaseAdmin
    .from('documents')
    .insert({
      agent_id,
      organization_id: req.organizationId,
      name,
      type: 'url',
      source_url: url,
      status: 'processing',
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  ragService.processDocument(doc.id).catch((err) =>
    console.error(`URL document processing failed [${doc.id}]:`, err)
  );

  res.status(202).json({ ...doc, message: 'Processing started' });
});

// Add FAQ / manual text content
router.post('/text', requireRole('owner', 'admin', 'member'), async (req, res) => {
  const schema = z.object({
    agent_id: z.string().uuid(),
    name: z.string().min(1),
    content: z.string().min(1).max(200000),
    type: z.enum(['faq', 'manual', 'txt']).default('faq'),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { agent_id, name, content, type } = parsed.data;

  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('id')
    .eq('id', agent_id)
    .eq('organization_id', req.organizationId)
    .single();

  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const { data: doc, error } = await supabaseAdmin
    .from('documents')
    .insert({
      agent_id,
      organization_id: req.organizationId,
      name,
      type,
      source_url: content,
      status: 'processing',
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  ragService.processDocument(doc.id).catch((err) =>
    console.error(`Text document processing failed [${doc.id}]:`, err)
  );

  res.status(202).json({ ...doc, message: 'Processing started' });
});

router.post('/:id/reprocess', requireRole('owner', 'admin'), async (req, res) => {
  const { data: doc } = await supabaseAdmin
    .from('documents')
    .select('id')
    .eq('id', req.params.id)
    .eq('organization_id', req.organizationId)
    .single();

  if (!doc) return res.status(404).json({ error: 'Document not found' });

  ragService.processDocument(doc.id).catch((err) =>
    console.error(`Reprocessing failed [${doc.id}]:`, err)
  );

  res.json({ message: 'Reprocessing started' });
});

router.delete('/:id', requireRole('owner', 'admin'), async (req, res) => {
  const { data: doc } = await supabaseAdmin
    .from('documents')
    .select('storage_path')
    .eq('id', req.params.id)
    .eq('organization_id', req.organizationId)
    .single();

  if (!doc) return res.status(404).json({ error: 'Document not found' });

  if (doc.storage_path) {
    await supabaseAdmin.storage.from('agent-documents').remove([doc.storage_path]);
  }

  const { error } = await supabaseAdmin
    .from('documents')
    .delete()
    .eq('id', req.params.id)
    .eq('organization_id', req.organizationId);

  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

module.exports = router;
