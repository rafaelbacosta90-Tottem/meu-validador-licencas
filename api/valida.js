import { createClient } from '@supabase/supabase-js';

// As chaves devem estar configuradas nas Variáveis de Ambiente da Vercel
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  // Aceita apenas requisições POST
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'Método não permitido.' });
  }

  // Captura os dados enviados pelo Buscador.py
  const { cnpj, hwid, maquina, data_acesso } = req.body;

  if (!cnpj || !hwid) {
    return res.status(400).json({ status: 'error', message: 'CNPJ e HWID são obrigatórios.' });
  }

  try {
    // 1. Busca a licença no Supabase
    const { data: licenca, error } = await supabase
      .from('licencas')
      .select('*')
      .eq('cnpj', cnpj)
      .eq('hwid', hwid)
      .single();

    if (error || !licenca) {
      return res.status(404).json({ status: 'error', message: 'Licença não encontrada para esta máquina.' });
    }

    // 2. Verifica se a licença está ativa
    if (!licenca.ativa) {
      return res.status(403).json({ status: 'error', message: 'Licença inativa ou bloqueada.' });
    }

    // 3. Grava o nome da máquina e a data do último acesso no Supabase
    const { error: updateError } = await supabase
      .from('licencas')
      .update({ 
        nome_maquina: maquina || 'Desconhecida',
        ultima_validacao: data_acesso || new Date().toISOString()
      })
      .eq('id', licenca.id);

    if (updateError) {
      console.error("Erro ao gravar log da máquina:", updateError);
      // O sistema continua mesmo se o log falhar, para não bloquear o cliente injustamente
    }

    // 4. Retorna sucesso e a data de validade para o Python
    return res.status(200).json({
      status: 'success',
      data_validade: licenca.data_expiracao
    });

  } catch (err) {
    console.error("Erro na API:", err);
    return res.status(500).json({ status: 'error', message: 'Erro interno no servidor de validação.' });
  }
}