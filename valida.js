import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  // Permite CORS (opcional, bom para evitar bloqueios)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'Método não permitido' });
  }

  // Agora recebe "cnpj" em vez de "chave"
  const { cnpj, hwid } = req.body;

  if (!cnpj || !hwid) {
    return res.status(400).json({ status: 'error', message: 'CNPJ e HWID são obrigatórios.' });
  }

  // 1. Busca o CNPJ no banco
  const { data: licenca, error } = await supabase
    .from('licencas')
    .select('*')
    .eq('cnpj', cnpj)
    .single();

  if (error || !licenca) {
    return res.status(404).json({ status: 'invalid', message: 'CNPJ não encontrado ou não cadastrado.' });
  }

  // 2. Verifica se a licença está ativa manualmente
  if (!licenca.ativa) {
    return res.status(403).json({ status: 'invalid', message: 'Licença desativada pelo administrador.' });
  }

  // 3. Verifica a Validade (Data Atual vs Data de Expiração)
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0); // Zera as horas para comparar apenas o dia
  
  const expiracao = new Date(licenca.data_expiracao);
  // Adiciona o fuso horário para evitar problemas de viragem de dia
  expiracao.setHours(23, 59, 59, 999);

  if (hoje > expiracao) {
    return res.status(403).json({ 
        status: 'expired', 
        message: 'A sua licença expirou no dia ' + expiracao.toLocaleDateString('pt-BR') + '. Contacte o suporte.'
    });
  }

  // 4. Bloqueia múltiplos PCs (HWID)
  if (!licenca.hwid) {
    // Registra a máquina no primeiro uso
    await supabase.from('licencas').update({ hwid: hwid }).eq('id', licenca.id);
  } else if (licenca.hwid !== hwid) {
    return res.status(403).json({ status: 'unauthorized', message: 'Este CNPJ já está vinculado a outro computador.' });
  }

  return res.status(200).json({ status: 'success', message: 'Licença válida!' });
}