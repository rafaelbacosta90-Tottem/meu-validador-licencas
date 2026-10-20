import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ status: 'error', message: 'Apenas POST.' });

    const { cnpj, hwid, maquina, versao_atual, ferramenta } = req.body;
    const nomeFerramenta = ferramenta || 'Buscador PNCP'; 

    if (!cnpj) return res.status(400).json({ status: 'error', message: 'CNPJ não fornecido.' });

    try {
        // 1. Encontra a Licença da Máquina (Baseado APENAS no CNPJ)
        const { data: licenca, error: erroLic } = await supabase
            .from('licencas')
            .select('id')
            .eq('cnpj', cnpj)
            .single();

        if (erroLic || !licenca) return res.status(403).json({ status: 'error', message: 'CNPJ não encontrado ou licença inválida.' });

        // 2. Encontra o ID da Ferramenta solicitada
        const { data: fer, error: erroFer } = await supabase
            .from('ferramentas')
            .select('id')
            .eq('nome', nomeFerramenta)
            .single();

        if (erroFer || !fer) return res.status(404).json({ status: 'error', message: `O módulo '${nomeFerramenta}' não existe no servidor.` });

        // 3. Cruza os dados para ver se este cliente tem este módulo ativo
        const { data: permissao, error: erroPerm } = await supabase
            .from('licencas_ferramentas')
            .select('data_expiracao, ativa')
            .eq('licenca_id', licenca.id)
            .eq('ferramenta_id', fer.id)
            .single();

        if (erroPerm || !permissao) return res.status(403).json({ status: 'error', message: `Você não possui o módulo '${nomeFerramenta}' liberado.` });
        if (!permissao.ativa) return res.status(403).json({ status: 'error', message: `O módulo '${nomeFerramenta}' foi bloqueado pelo administrador.` });

        const hoje = new Date().toISOString().split('T')[0];
        if (hoje > permissao.data_expiracao) return res.status(403).json({ status: 'error', message: `A licença do módulo '${nomeFerramenta}' expirou.` });

        // 4. Salva o Log de Acesso com o nome real da máquina
        await supabase.from('acessos_clientes').upsert({
            cnpj: cnpj, 
            maquina: maquina || 'Desconhecida', 
            versao_atual: versao_atual, 
            data_ultimo_acesso: new Date().toISOString()
        }, { onConflict: 'cnpj,maquina' });

        return res.status(200).json({ status: 'success', message: 'Licença válida!', data_validade: permissao.data_expiracao });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ status: 'error', message: 'Erro interno no servidor de validação.' });
    }
}