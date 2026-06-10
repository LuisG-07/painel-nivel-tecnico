# SkillMatrix Pro

Painel interno para avaliação técnica do time de suporte. Avalia analistas em módulos técnicos com notas de 1 a 5, calcula Nota Técnica, Nota de Prova e Nota Zendesk, e gera rankings e planos de treinamento.

## Como abrir

### Versão standalone (para distribuição)
Abra `dist/SkillMatrix_Pro.html` diretamente no navegador. Funciona offline via `file://`, sem servidor.

### Versão de desenvolvimento (multi-arquivo)
Abra `index.html` via servidor local. Opções rápidas:

```powershell
# Python (se instalado)
python -m http.server 8080

# Node.js (se instalado)
npx serve .
```

Depois acesse `http://localhost:8080`.

> **Nota:** `index.html` não funciona diretamente via `file://` pois carrega scripts externos — use o servidor local ou o arquivo `dist/`.

## Como buildar o HTML standalone

### Com PowerShell (não requer Node.js)
```powershell
.\build.ps1
```
Gera `dist\SkillMatrix_Pro.html`.

### Com Node.js
```bash
node build.js
```
Gera `dist/SkillMatrix_Pro.html`.

## Arquitetura

```
SkillMatrix_Pro/
├── index.html              # Shell HTML: topbar, páginas vazias, modais
├── css/
│   └── main.css            # Todos os estilos
├── js/
│   ├── data/
│   │   └── seed.js         # Dados iniciais: SEED_ANALYSTS, SEED_MODULES, SEED_SECTORS
│   ├── store/
│   │   └── storage.js      # localStorage: leitura segura, validação de schema, migração
│   ├── domain/
│   │   └── scores.js       # Funções puras: cálculo de notas, cores, badges, escaping
│   ├── ui/
│   │   ├── overview.js     # Renderiza aba "Visão Geral"
│   │   ├── evolution.js    # Renderiza aba "Evolução" (Chart.js)
│   │   ├── training.js     # Renderiza aba "Treinamento"
│   │   └── modals.js       # Lógica de todos os modais
│   └── main.js             # Estado global, navegação, operações CRUD, exportação
├── build.js                # Build com Node.js
├── build.ps1               # Build com PowerShell
└── dist/
    └── SkillMatrix_Pro.html  # Arquivo gerado — distribuir este
```

### Chaves do localStorage

| Chave | Conteúdo |
|---|---|
| `skm6_ana` | Array de analistas |
| `skm6_mods` | Array de módulos |
| `skm6_sec` | Array de setores |
| `skm6_train` | Array de treinamentos |
| `skm6_hist` | Histórico de scores por analista |

## Modelo de dados

### Analyst
```js
{
  id:       number,           // timestamp ou inteiro único
  name:     string,           // nome completo
  sector:   string,           // "Chat" | "Telefone" | "Notas" | setor customizado
  zendesk:  number | null,    // nota 0–10 (integração futura)
  provaAvg: number | null,    // média das provas (calculado automaticamente)
  photo:    string | null,    // base64 da foto
  comment:  string,           // até 500 caracteres
  anexos:   string[],         // array de base64 de imagens
  scores:   { [module]: 1–5 } // nota por módulo
}
```

### Training
```js
{
  date:     string,       // ex: "2026-06-15"
  module:   string,       // nome do módulo treinado
  leader:   string,       // nome do líder
  obs:      string,       // observações
  analysts: string[],     // nomes dos participantes
  provas:   { [name]: number }, // notas 0–10 por participante
  status:   "pending" | "done"
}
```

## Exportar HTML

Clique em **Exportar HTML** na barra superior. O arquivo gerado já contém todos os dados atuais e pode ser aberto offline — é o que deve ser distribuído para gestores.

## Notas de segurança

- Todos os dados do usuário passam por `Domain.escapeHtml()` antes de ser inseridos no DOM.
- Erros de `localStorage` (quota excedida, JSON inválido) são tratados com fallback para os dados semente.
- Imagens são armazenadas como base64 — fotos e anexos muito grandes podem aproximar o limite de ~5 MB do localStorage. O sistema avisa no console quando o uso ultrapassa 4 MB.
