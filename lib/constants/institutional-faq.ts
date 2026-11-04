export interface InstitutionalFaqItem {
    question: string;
    answer: string;
}

export const INSTITUTIONAL_FAQ: InstitutionalFaqItem[] = [
    {
        question: "A Dudit atende apenas negócios locais ou funciona em todo o Brasil?",
        answer: "A Dudit opera em todo o território nacional. A plataforma foi desenvolvida tanto para vendas de proximidade (com retirada no balcão físico ou entrega local via motoboy) quanto para vendas e envios nacionais para qualquer estado e CEP do Brasil através de integrações com transportadoras e Correios com cálculo automático de frete."
    },
    {
        question: "A Dudit cobra comissão sobre as vendas realizadas?",
        answer: "Não! A Dudit opera com 0% de comissão por venda. Diferente dos marketplaces tradicionais que cobram taxas de 12% a mais de 20% sobre o seu faturamento, na Dudit 100% do lucro das suas vendas fica com você."
    },
    {
        question: "A Dudit é apenas um guia/diretório de lojas ou um sistema de gestão completo?",
        answer: "A Dudit é um ecossistema completo de gestão comercial (ERP e PDV) e vendas. A plataforma oferece frente de caixa (PDV) para vendas no balcão, controle de estoque com variações (cor e tamanho), ordens de serviço (OS) com orçamentos digitais, agendamento de horários para serviços e catálogo online integrado ao WhatsApp e checkout próprio."
    },
    {
        question: "Como funciona a entrega local e o frete nacional na Dudit?",
        answer: "O lojista tem autonomia completa: pode habilitar a opção de retirada no balcão físico, definir entregadores próprios ou motoboys com taxas personalizadas por bairro ou raio, e ativar fretes nacionais com cálculo automático, geração de etiquetas e rastreio integrado via transportadoras e Correios."
    },
    {
        question: "Quais segmentos de negócios podem utilizar a Dudit?",
        answer: "A Dudit atende lojas de roupas, calçados, autopeças, cosméticos, eletrônicos, confeitarias e alimentação, assistências técnicas e oficinas mecânicas, salões de beleza, barbearias, prestadores de serviços e autônomos que desejam vender mais e gerenciar seu negócio sem burocracia."
    }
];

export function getInstitutionalFaqJsonLd() {
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: INSTITUTIONAL_FAQ.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: {
                "@type": "Answer",
                text: item.answer,
            },
        })),
    };
}

