import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    
    const { cnpj, hwid, maquina, incrementar } = req.body;
    if (!cnpj || !hwid) return res.status(400).json({ status: 'error', message: 'CNPJ ou HWID não fornecido.' });

    try {
        // 1. Pega o Limite Diário DAQUELA MÁQUINA
        const { data: licenca } = await supabase.from('licencas').select('limite_ia_diario').eq('cnpj', cnpj).single();
        const limiteDiario = licenca?.limite_ia_diario;

        // 2. Conta os usos da máquina hoje
        const hoje = new Date().toISOString().split('T')[0];
        const { data: acesso } = await supabase.from('acessos_clientes').select('usos_ia_hoje, data_uso_ia').eq('cnpj', cnpj).eq('maquina', maquina).single();

        let usoDestaMaquina = 0;
        if (acesso && acesso.data_uso_ia === hoje) {
            usoDestaMaquina = acesso.usos_ia_hoje || 0;
        }

        // 3. Verifica Limite e Incrementa
        if (incrementar) {
            if (usoDestaMaquina >= limiteDiario) {
                return res.status(403).json({ status: 'error', message: `O limite diário de ${limiteDiario} análises desta máquina foi atingido.` });
            }
            
            await supabase.from('acessos_clientes').upsert({
                cnpj: cnpj, maquina: maquina || 'Desconhecida', usos_ia_hoje: usoDestaMaquina + 1, data_uso_ia: hoje, data_ultimo_acesso: new Date().toISOString()
            }, { onConflict: 'cnpj,maquina' });
            
            usoDestaMaquina += 1;
        }

        // 4. Retorna as chaves seguras
        const { data: config } = await supabase.from('controle_versoes').select('chave_dots, chave_gemini').eq('id', 1).single();

        return res.status(200).json({
            status: 'success', chave_dots: config?.chave_dots || '', chave_gemini: config?.chave_gemini || '', usos_hoje: usoDestaMaquina, limite_diario: limiteDiario
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ status: 'error', message: 'Erro no servidor de IA.' });
    }
}