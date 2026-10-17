import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ status: 'error', message: 'Apenas POST' });

    const { cnpj, maquina, incrementar } = req.body;
    if (!cnpj) return res.status(400).json({ status: 'error', message: 'CNPJ obrigatório.' });

    try {
        // 1. Pega o Limite Diário do CNPJ
        const { data: licenca } = await supabase.from('licencas').select('limite_ia_diario').eq('cnpj', cnpj).single();
        const limiteDiario = licenca?.limite_ia_diario || 10;

        // 2. Conta quantos usos esse CNPJ já teve HOJE
        const hoje = new Date().toISOString().split('T')[0];
        const { data: acessos } = await supabase.from('acessos_clientes').select('maquina, usos_ia_hoje, data_uso_ia').eq('cnpj', cnpj);

        let totalUsosCNPJ = 0;
        let usoDestaMaquina = 0;

        if (acessos) {
            for (let a of acessos) {
                if (a.data_uso_ia === hoje) {
                    totalUsosCNPJ += (a.usos_ia_hoje || 0);
                    if (a.maquina === maquina) usoDestaMaquina = (a.usos_ia_hoje || 0);
                }
            }
        }

        // 3. Verifica Limite e Incrementa
        if (incrementar) {
            if (totalUsosCNPJ >= limiteDiario) {
                return res.status(403).json({ status: 'error', message: `O limite diário de ${limiteDiario} análises de IA para o seu plano foi atingido hoje.` });
            }
            
            // Grava o novo uso na máquina específica
            await supabase.from('acessos_clientes').upsert({
                cnpj: cnpj,
                maquina: maquina || 'Desconhecida',
                usos_ia_hoje: usoDestaMaquina + 1,
                data_uso_ia: hoje,
                data_ultimo_acesso: new Date().toISOString()
            }, { onConflict: 'cnpj,maquina' });
            
            totalUsosCNPJ += 1; // Atualiza a resposta
        }

        // 4. Se autorizou, entrega as chaves de IA protegidas
        const { data: config } = await supabase.from('controle_versoes').select('chave_dots, chave_gemini').eq('id', 1).single();

        return res.status(200).json({
            status: 'success',
            chave_dots: config?.chave_dots || '',
            chave_gemini: config?.chave_gemini || '',
            usos_hoje: totalUsosCNPJ,
            limite_diario: limiteDiario
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ status: 'error', message: 'Erro no servidor de IA.' });
    }
}