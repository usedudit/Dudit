export type OpeningHoursData = {
  [day in string]?: {
    enabled: boolean
    from: string
    to: string
  }
}

const DAYS_OF_WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
const DAY_NAMES: Record<string, string> = {
  sunday: "domingo",
  monday: "segunda-feira",
  tuesday: "terça-feira",
  wednesday: "quarta-feira",
  thursday: "quinta-feira",
  friday: "sexta-feira",
  saturday: "sábado",
}

export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr || !timeStr.includes(':')) return -1;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return -1;
  return h * 60 + m;
}

/**
 * Resolve o status de horário de funcionamento de uma loja
 */
export function getOpeningStatus(
  openingHours: OpeningHoursData | null | undefined,
  nowDate: Date = new Date()
): string {
  if (!openingHours || typeof openingHours !== "object") {
    return "Informações de horário não disponíveis";
  }

  const currentDayIndex = nowDate.getDay();
  const currentMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();

  // Verifica horários válidos hoje
  const todayKey = DAYS_OF_WEEK[currentDayIndex];
  const todaySchedule = openingHours[todayKey];

  if (todaySchedule?.enabled && todaySchedule.from && todaySchedule.to) {
    const fromMins = parseTimeToMinutes(todaySchedule.from);
    let toMins = parseTimeToMinutes(todaySchedule.to);

    // Se a loja fecha no dia seguinte de madrugada (ex: 18:00 - 02:00)
    if (toMins <= fromMins) toMins += 24 * 60;

    if (currentMinutes >= fromMins && currentMinutes < toMins) {
      // Estamos ABERTO
      const closeTime = todaySchedule.to;
      return `Aberto até ${closeTime}`;
    }

    if (currentMinutes < fromMins) {
      // Estamos FECHADO, mas o usuário visualizou antes de abrir HOJE
      return `Fechado - Abre às ${todaySchedule.from}`;
    }
  }

  // Estamos FECHADO para hoje, busca o próximo dia que estará aberto
  for (let i = 1; i <= 7; i++) {
    const nextDayIndex = (currentDayIndex + i) % 7;
    const nextDayKey = DAYS_OF_WEEK[nextDayIndex];
    const nextSchedule = openingHours[nextDayKey];

    if (nextSchedule?.enabled && nextSchedule.from && nextSchedule.to) {
      if (i === 1) {
        return `Fechado - Abre amanhã às ${nextSchedule.from}`;
      } else {
        return `Fechado - Abre ${DAY_NAMES[nextDayKey]} às ${nextSchedule.from}`;
      }
    }
  }

  return "Temporariamente fechado";
}
