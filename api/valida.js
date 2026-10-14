import { createClient } from '@supabase/supabase-js';

// Inicializa a conexão com o Supabase usando as variáveis de ambiente da Vercel
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    // Configuração de segurança CORS (Permite que o programa Python faça o request)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Apenas método POST é permitido.' });
    }

    // Recebe os dados enviados pelo Buscador.py
    const { cnpj, hwid, maquina, data_acesso, versao_atual } = req.body;

    if (!cnpj) {
        return res.status(400).json({ status: 'error', message: 'CNPJ não fornecido.' });
    }

    try {
        // =======================================================================
        // PASSO 1: VERIFICAR A LICENÇA DO CLIENTE
        // ATENÇÃO: Substitua 'licencas' pelo nome da sua tabela principal de clientes
        // =======================================================================
        const { data: licenca, error: erroLicenca } = await supabase
            .from('licencas') 
            .select('*')
            .eq('cnpj', cnpj)
            .single();

        if (erroLicenca || !licenca) {
            return res.status(403).json({ status: 'error', message: 'CNPJ não encontrado ou não autorizado.' });
        }

        // Pega a data de validade que está no banco de dados (ajuste o nome da coluna se necessário)
        const dataValidade = licenca.data_validade || licenca.data_expiracao; 

        // Verificação extra de segurança no servidor
        const hoje = new Date().toISOString().split('T')[0];
        if (hoje > dataValidade) {
            return res.status(403).json({ status: 'error', message: 'A sua licença expirou.' });
        }


        // =======================================================================
        // PASSO 2: GRAVAR O LOG NA NOVA TABELA 'acessos_clientes' (UPSERT)
        // =======================================================================
        const { error: erroLog } = await supabase
            .from('acessos_clientes')
            .upsert(
                { 
                    cnpj: cnpj,
                    maquina: maquina || 'Desconhecida',
                    versao_atual: versao_atual || 'Antiga',
                    data_ultimo_acesso: new Date().toISOString()
                },
                { onConflict: 'cnpj,maquina' } // Atualiza a linha se a máquina e CNPJ já existirem
            );

        if (erroLog) {
            console.error("Erro ao gravar log no Supabase:", erroLog);
            // Ignoramos o erro para não impedir o cliente de entrar só por falha no log
        }


        // =======================================================================
        // PASSO 3: RETORNAR SUCESSO E A DATA PARA O PYTHON
        // =======================================================================
        return res.status(200).json({
            status: 'success',
            message: 'Licença válida!',
            data_validade: dataValidade // Retorna a data para o Python criar a Assinatura HMAC local
        });

    } catch (error) {
        console.error("Erro interno da API:", error);
        return res.status(500).json({ status: 'error', message: 'Erro interno no servidor de validação.' });
    }
}