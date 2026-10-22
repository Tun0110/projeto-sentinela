const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = 3000;

const DB_FILE = path.join(__dirname, "db.json");
const FRONTEND_DIR = path.join(__dirname, "../frontend");

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(FRONTEND_DIR));

// ========================================
// BANCO DE DADOS JSON
// ========================================

function criarBancoInicial() {
    return {
        usuarios: [],
        pacientes: [],
        triagens: [],
        consultas: [],
        chamadas: [],
        chamadaAtual: null
    };
}

function readDB() {
    if (!fs.existsSync(DB_FILE)) {
        const banco = criarBancoInicial();
        writeDB(banco);
        return banco;
    }

    const conteudo = fs.readFileSync(DB_FILE, "utf8");
    const banco = JSON.parse(conteudo);

    // Completa as listas ausentes sem apagar os dados existentes.
    banco.usuarios ??= [];
    banco.pacientes ??= [];
    banco.triagens ??= [];
    banco.consultas ??= [];
    banco.chamadas ??= [];
    banco.chamadaAtual ??= null;

    return banco;
}

function writeDB(data) {
    const temporario = DB_FILE + ".tmp";

    fs.writeFileSync(
        temporario,
        JSON.stringify(data, null, 2),
        "utf8"
    );

    // Substitui o arquivo anterior depois de gerar o novo.
    fs.renameSync(temporario, DB_FILE);
}

function tratarErro(res, erro, mensagem) {
    console.error(mensagem, erro);

    if (!res.headersSent) {
        res.status(500).json({
            erro: mensagem
        });
    }
}

// ========================================
// ADMINISTRADOR: LISTAR USUÁRIOS
// ========================================

app.get("/usuarios", (req, res) => {
    try {
        const db = readDB();

        // Nunca enviar as senhas na resposta.
        const usuarios = db.usuarios.map(u => ({
            usuario: u.usuario,
            tipo: u.tipo
        }));

        res.json(usuarios);
    } catch (erro) {
        tratarErro(res, erro, "Erro ao carregar usuários.");
    }
});

// ========================================
// ADMINISTRADOR: CADASTRAR USUÁRIO
// ========================================

app.post("/usuarios", (req, res) => {
    try {
        const db = readDB();

        const usuario = String(req.body.usuario || "").trim();
        const senha = String(req.body.senha || "");
        const tipo = req.body.tipo;

        if (!usuario || !senha || !tipo) {
            return res.status(400).json({
                erro: "Preencha todos os campos."
            });
        }

        if (usuario.length > 100 || senha.length > 200) {
            return res.status(400).json({
                erro: "Usuário ou senha muito longos."
            });
        }

        const tiposPermitidos = [
            "atendimento",
            "triagem",
            "medico"
        ];

        if (!tiposPermitidos.includes(tipo)) {
            return res.status(400).json({
                erro: "Selecione um setor válido."
            });
        }

        const existe = db.usuarios.some(u =>
            String(u.usuario || "").toLowerCase() ===
            usuario.toLowerCase()
        );

        if (existe) {
            return res.status(409).json({
                erro: "Este usuário já está cadastrado."
            });
        }

        const novoUsuario = {
            usuario,
            senha,
            tipo
        };

        db.usuarios.push(novoUsuario);
        writeDB(db);

        res.status(201).json({
            mensagem: "Usuário salvo no banco de dados.",
            usuario: {
                usuario: novoUsuario.usuario,
                tipo: novoUsuario.tipo
            }
        });
    } catch (erro) {
        tratarErro(res, erro, "Erro ao salvar o usuário.");
    }
});

// ========================================
// LOGIN
// ========================================

app.post("/login", (req, res) => {
    try {
        const db = readDB();

        const usuario = String(req.body.usuario || "").trim();
        const senha = String(req.body.senha || "");

        const user = db.usuarios.find(u =>
            u.usuario === usuario &&
            u.senha === senha
        );

        if (!user) {
            return res.status(401).json({
                erro: "Usuário ou senha inválidos."
            });
        }

        // Não devolver a senha ao navegador.
        res.json({
            usuario: user.usuario,
            tipo: user.tipo
        });
    } catch (erro) {
        tratarErro(res, erro, "Erro ao realizar login.");
    }
});

// ========================================
// ATENDIMENTO: CADASTRAR PACIENTE
// ========================================

app.post("/atendimento", (req, res) => {
    try {
        const db = readDB();

       const nome = String(req.body.nome || "").trim();
    const cpf = String(req.body.cpf || "").replace(/\D/g, "");
    const tipo = req.body.tipo;

    if (cpf.length > 11) {
        return res.status(400).json({
            erro: "O CPF deve ter no máximo 11 dígitos."
        });
    }

        if (!nome || !cpf || !tipo) {
            return res.status(400).json({
                erro: "Nome e tipo de atendimento são obrigatórios."
            });
        }

        const tiposPermitidos = [
            "Convenio",
            "Particular",
            "Publico"
        ];

        if (!tiposPermitidos.includes(tipo)) {
            return res.status(400).json({
                erro: "Tipo de atendimento inválido."
            });
        }

        const paciente = {
            id: Date.now(),
            nome,
            cpf,
            tipo,
            status: "triagem",
            createdAt: new Date().toISOString()
        };

        db.pacientes.push(paciente);
        writeDB(db);

        res.status(201).json(paciente);
    } catch (erro) {
        tratarErro(res, erro, "Erro ao salvar paciente.");
    }
});

// ========================================
// LISTAR PACIENTES
// ========================================

app.get("/pacientes", (req, res) => {
    try {
        const db = readDB();
        res.json(db.pacientes);
    } catch (erro) {
        tratarErro(res, erro, "Erro ao carregar pacientes.");
    }
});

// ========================================
// TRIAGEM: SALVAR
// ========================================

app.post("/triagem", (req, res) => {
    try {
        const db = readDB();

        const nome = String(req.body.nome || "").trim();
        const sintoma = String(req.body.sintoma || "");
        const temperatura = Number(req.body.temperatura);

        if (!nome || !sintoma || !Number.isFinite(temperatura)) {
            return res.status(400).json({
                erro: "Informe nome, sintoma e temperatura válida."
            });
        }

        const vermelhos = [
            "infarto",
            "avc",
            "convulsao",
            "hemorragia",
            "falta_ar_grave"
        ];

        const amarelos = [
            "febre",
            "vomito",
            "diarreia",
            "falta_ar_moderada"
        ];

        let risco = "verde";

        if (temperatura >= 39 || vermelhos.includes(sintoma)) {
            risco = "vermelho";
        } else if (
            temperatura >= 38 ||
            amarelos.includes(sintoma)
        ) {
            risco = "amarelo";
        }

        const triagem = {
            id: Date.now(),
            nome,
            sintoma,
            temperatura,
            alergia: String(req.body.alergia || "Nenhuma"),
            observacao: String(req.body.observacao || ""),
            risco,
            status: "aguardando_medico",
            createdAt: new Date().toISOString()
        };

        db.triagens.push(triagem);

        // Atualiza o status do paciente correspondente, se encontrado.
        const paciente = db.pacientes.find(p =>
            p.nome.toLowerCase() === nome.toLowerCase() &&
            p.status === "triagem"
        );

        if (paciente) {
            paciente.status = "aguardando_medico";
        }

        writeDB(db);
        res.status(201).json(triagem);
    } catch (erro) {
        tratarErro(res, erro, "Erro ao salvar triagem.");
    }
});

// ========================================
// LISTAR TRIAGENS
// ========================================

app.get("/triagens", (req, res) => {
    try {
        const db = readDB();

        res.json(
            db.triagens.filter(t =>
                t.status !== "atendido"
            )
        );
    } catch (erro) {
        tratarErro(res, erro, "Erro ao carregar triagens.");
    }
});

// ========================================
// LISTA DE MEDICAÇÕES
// ========================================

app.get("/lista-medicacoes", (req, res) => {
    res.json([
        "Dipirona",
        "Paracetamol",
        "Ibuprofeno",
        "Amoxicilina",
        "Azitromicina",
        "Loratadina",
        "Omeprazol",
        "Buscopan",
        "Dramin",
        "Soro fisiológico"
    ]);
});

// ========================================
// CONSULTA: SALVAR
// ========================================

app.post("/consulta", (req, res) => {
    try {
        const db = readDB();

        const paciente = String(req.body.paciente || "").trim();
        const diagnostico = String(req.body.diagnostico || "").trim();
        const medicacao = String(req.body.medicacao || "").trim();
        const obs = String(req.body.obs || "").trim();

        if (!paciente || !medicacao) {
            return res.status(400).json({
                erro: "Paciente e medicação são obrigatórios."
            });
        }

        const consulta = {
            id: Date.now(),
            paciente,
            diagnostico,
            medicacao,
            obs,
            createdAt: new Date().toISOString()
        };

        db.consultas.push(consulta);

        const triagem = db.triagens.find(t =>
            t.nome.toLowerCase() === paciente.toLowerCase() &&
            t.status !== "atendido"
        );

        if (triagem) {
            triagem.status = "atendido";
        }

        const registroPaciente = db.pacientes.find(p =>
            p.nome.toLowerCase() === paciente.toLowerCase()
        );

        if (registroPaciente) {
            registroPaciente.status = "atendido";
        }

        writeDB(db);
        res.status(201).json(consulta);
    } catch (erro) {
        tratarErro(res, erro, "Erro ao salvar consulta.");
    }
});

// ========================================
// LISTAR MEDICAÇÕES PRESCRITAS
// ========================================

app.get("/medicacoes", (req, res) => {
    try {
        const db = readDB();
        res.json(db.consultas);
    } catch (erro) {
        tratarErro(res, erro, "Erro ao carregar medicações.");
    }
});

// ========================================
// CHAMAR PACIENTE NA TV
// ========================================

app.post("/tv/chamar", (req, res) => {
    try {
        const db = readDB();

        const paciente = String(req.body.paciente || "").trim();
        const localTipo = String(req.body.localTipo || "GUICHÊ").trim();
        const localNumero = String(req.body.localNumero || "").trim();

        if (!paciente) {
            return res.status(400).json({
                erro: "Informe o nome do paciente."
            });
        }

        const chamada = {
            id: Date.now(),
            paciente,
            localTipo,
            localNumero,
            createdAt: new Date().toISOString()
        };

        db.chamadaAtual = chamada;
        db.chamadas.unshift(chamada);
        db.chamadas = db.chamadas.slice(0, 20);

        writeDB(db);
        res.status(201).json(chamada);
    } catch (erro) {
        tratarErro(res, erro, "Erro ao registrar chamada.");
    }
});

// ========================================
// TV: CHAMADA ATUAL E HISTÓRICO
// ========================================

app.get("/tv/chamada", (req, res) => {
    try {
        const db = readDB();

        res.json({
            chamada: db.chamadaAtual || null,
            historico: db.chamadas || []
        });
    } catch (erro) {
        tratarErro(res, erro, "Erro ao carregar chamadas da TV.");
    }
});

// ========================================
// INICIAR SERVIDOR
// ========================================

app.listen(PORT, () => {
    console.log(`🏥 Sistema Hospitalar rodando em http://localhost:${PORT}`);
});
