const OpenAI = require('openai');
const { supabaseAdmin } = require('../config/supabase');
const { chunkText, extractText } = require('../utils/chunker');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EMBEDDING_MODEL = 'text-embedding-3-small';

async function embedText(text) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.replace(/\n/g, ' ').trim(),
  });
  return response.data[0].embedding;
}

async function searchChunks(agentId, query, matchCount = 5, threshold = 0.7) {
  const embedding = await embedText(query);

  const { data, error } = await supabaseAdmin.rpc('search_agent_chunks', {
    p_agent_id: agentId,
    p_embedding: embedding,
    p_match_count: matchCount,
    p_threshold: threshold,
  });

  if (error) throw error;
  return data || [];
}

async function processDocument(documentId) {
  const { data: doc, error } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (error || !doc) throw new Error('Document not found');

  await supabaseAdmin
    .from('documents')
    .update({ status: 'processing' })
    .eq('id', documentId);

  try {
    let text = '';

    if (doc.type === 'url') {
      const response = await fetch(doc.source_url);
      text = await response.text();
      text = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    } else if (doc.storage_path) {
      const { data: fileData, error: downloadError } = await supabaseAdmin.storage
        .from('agent-documents')
        .download(doc.storage_path);

      if (downloadError) throw downloadError;

      const buffer = Buffer.from(await fileData.arrayBuffer());
      text = await extractText(buffer, doc.type);
    } else if (doc.type === 'faq' || doc.type === 'manual') {
      text = doc.source_url || '';
    }

    if (!text.trim()) throw new Error('No text content extracted');

    const chunks = chunkText(text);

    await supabaseAdmin
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId);

    const chunkRows = [];
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await embedText(chunks[i]);
      chunkRows.push({
        document_id: documentId,
        agent_id: doc.agent_id,
        content: chunks[i],
        embedding,
        chunk_index: i,
        metadata: { source: doc.name, type: doc.type },
      });
    }

    const { error: insertError } = await supabaseAdmin
      .from('document_chunks')
      .insert(chunkRows);

    if (insertError) throw insertError;

    await supabaseAdmin
      .from('documents')
      .update({ status: 'ready', chunk_count: chunks.length })
      .eq('id', documentId);

    return { chunkCount: chunks.length };
  } catch (err) {
    await supabaseAdmin
      .from('documents')
      .update({ status: 'error' })
      .eq('id', documentId);
    throw err;
  }
}

module.exports = { embedText, searchChunks, processDocument };
