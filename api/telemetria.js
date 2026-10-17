import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    // Configuração CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Apenas POST' });

    const { cnpj, maquina, qtd_editais } = req.body;
    if (!cnpj || !qtd_editais) return res.status(400).json({ error: 'Faltam dados' });

    try {
        // Busca a contagem atual daquela máquina
        const { data: acesso } = await supabase
            .from('acessos_clientes')
            .select('editais_baixados')
            .eq('cnpj', cnpj)
            .eq('maquina', maquina || 'Desconhecida')
            .single();
        
        const atual = (acesso?.editais_baixados || 0);
        
        // Atualiza somando o novo lote de editais
        await supabase.from('acessos_clientes')
            .update({ 
                editais_baixados: atual + qtd_editais,
                data_ultimo_acesso: new Date().toISOString()
            })
            .eq('cnpj', cnpj)
            .eq('maquina', maquina || 'Desconhecida');

        return res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Erro interno' });
    }
}