import {
  appModuleLabels,
  defaultNavTabLabels,
  navMenu,
  permissionCatalog,
  type AppModule,
  type NavTab,
} from "@crm/contracts";
import { guideCountByArea } from "./search.js";

const origin = "https://crm.organizastudios.com";

/** Área dos guias (sigla do id) que corresponde a cada aba do menu. */
const tabAreas: Record<NavTab, readonly string[]> = {
  dashboard: ["VG"],
  agenda: ["AG"],
  groups: ["GR"],
  patients: ["CL", "LX"],
  plans: ["PL"],
  clinical: ["PR"],
  crm: ["CM"],
  events: ["EV"],
  relationship: ["RE"],
  waitlist: ["LE"],
  communications: ["CO"],
  contracts: ["CT", "AS"],
  sales: ["VE"],
  finance: ["FI"],
  reports: ["RL"],
  history: ["HI"],
  settings: ["CF"],
  profile: ["MP"],
};

// Conceitos que valem para o CRM inteiro; o resto vem do menu e do catálogo de permissões.
const concepts = [
  "Cliente é a pessoa atendida pela clínica (no código, paciente). Lead ou pessoa interessada é quem ainda não é cliente e fica no CRM comercial.",
  "Os nomes das abas do menu podem ter sido trocados pela clínica em Configurações; os endereços continuam os mesmos.",
  "Há dois tipos de usuário: Admin, com acesso total (inclusive Configurações de administração), e Usuário comum, que só faz as operações liberadas uma a uma. Se um botão ou aba não aparece, a causa pode ser falta de permissão; quem libera é um Admin em Configurações → Usuários.",
  "Sem a permissão de acesso de um módulo, a aba some do menu e as outras operações desse módulo não funcionam.",
  "Visão geral e Meu perfil aparecem para todos os usuários. A Lixeira de clientes fica dentro de Clientes.",
];

function operationsOf(module: AppModule) {
  return permissionCatalog
    .filter((item) => item.module === module)
    .map(({ key, name, description }) => ({
      permissao: key,
      nome: name,
      descricao: description,
    }));
}

function screen(tab: NavTab, to: string, module?: AppModule) {
  const access = permissionCatalog.find(
    (item) => item.key === `${module}.view`,
  );
  const counts = guideCountByArea();
  return {
    aba: tab,
    nome: defaultNavTabLabels[tab],
    endereco: `${origin}${to === "/" ? "/" : to}`,
    modulo: module ?? null,
    exigePermissao: module ? `${module}.view` : null,
    resumo: access?.description ?? null,
    areasDeGuias: tabAreas[tab],
    guias: tabAreas[tab].reduce((sum, area) => sum + (counts[area] ?? 0), 0),
  };
}

export const overviewModules = Object.keys(appModuleLabels) as [
  AppModule,
  ...AppModule[],
];

/**
 * Mapa do CRM montado a partir do próprio código: menu, o que cada módulo faz e as operações
 * (permissões) de cada um, com os nomes que aparecem em Configurações → Usuários.
 */
export function crmOverview(module?: AppModule) {
  if (!module)
    return {
      orientacao:
        "Use este mapa para situar a pergunta (em que tela e módulo ela acontece) e depois busque e leia os guias. Para ver as operações de um módulo, chame visao_geral_crm com o módulo.",
      conceitos: concepts,
      menu: navMenu.map((group) => ({
        grupo: group.label,
        telas: group.items.map((item) =>
          screen(item.tab, item.to, item.module),
        ),
      })),
      modulos: overviewModules.map((item) => ({
        modulo: item,
        nome: appModuleLabels[item],
        operacoes: operationsOf(item).length,
      })),
    };
  const tabs = navMenu.flatMap((group) =>
    group.items.filter((item) => item.module === module),
  );
  return {
    orientacao:
      "Cada operação corresponde a uma permissão que o Admin libera em Configurações → Usuários. A descrição diz o que a operação permite; os passos estão nos guias.",
    modulo: module,
    nome: appModuleLabels[module],
    telas: tabs.map((item) => screen(item.tab, item.to, item.module)),
    operacoes: operationsOf(module),
  };
}
