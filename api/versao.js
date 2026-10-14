import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
        // Busca sempre a linha com id=1 onde guardamos a configuração
        const { data, error } = await supabase
            .from('controle_versoes')
            .select('*')
            .eq('id', 1)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: 'Configuração não encontrada' });
        }

        return res.status(200).json(data);
    } catch (error) {
        return res.status(500).json({ error: 'Erro no servidor' });
    }
}