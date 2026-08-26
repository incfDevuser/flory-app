import type { PlantStatus } from '@/lib/plant-vocab';

/**
 * Lo que la planta dice según su estado.
 *
 * Seis variantes por estado, rotando (FlorySpec §282). Nunca reta, nunca culpa y nunca
 * finge certeza: si hay que revisar la tierra, lo pide en vez de afirmar que está seca.
 *
 * Vive en `lib` porque el Home y la ficha tienen que sonar igual. Dos listas separadas
 * derivan, y la planta terminaría hablando distinto en cada pantalla.
 */
const MESSAGES: Record<PlantStatus, string[]> = {
  bien: [
    'Estoy tranquila y con buen ritmo. Hoy solo vengo a hacerte compañía.',
    'Todo va bien por aquí. Puedes dejarme disfrutar de mi rincón.',
    'Mi tierra sigue acompañándome bien. Hoy no necesito agua.',
    'Estoy cómoda y contenta en este lugar. Seguimos así.',
    'Hoy me siento bien. Gracias por mirar cómo voy.',
    'Mi ritmo está en orden. Puedes volver a verme cuando quieras.',
  ],
  atencion: [
    'Mi tierra pronto podría necesitar agua. Cuando puedas, échame un vistazo.',
    'Me estoy acercando a mi próximo riego. Revisemos mi tierra con calma.',
    'Pronto me vendrá bien un poco de agua. Aún estamos a tiempo.',
    'Estoy empezando a pedir atención. Puedes tocar mi tierra para comprobarla.',
    'Mi próximo riego se acerca. Te aviso antes para que no haya apuro.',
    'Creo que pronto tendré sed. Una revisión de mi tierra nos ayudará.',
  ],
  urgente: [
    'Creo que ya tengo sed. Cuando puedas, revisa mi tierra y dame agua.',
    'Mi riego está pendiente, pero todavía podemos ponernos al día con calma.',
    'Me vendría bien agua hoy. Primero comprueba cómo está mi tierra.',
    'Estoy esperando mi próximo riego. Una mirada a mi tierra nos orientará.',
    'Hoy necesito un poco más de atención. Revisemos si mi tierra está seca.',
    'Puede que ya sea momento de regarme. Lo vemos juntas, sin apuro.',
  ],
};

/**
 * Una frase estable por planta y por día.
 *
 * La semilla mezcla el id con la fecha: dentro del mismo día la planta repite lo mismo
 * —cambiar de frase en cada render se ve como un glitch— y al día siguiente rota.
 */
export function dailyMessage(plantId: string, status: PlantStatus): string {
  const dayKey = new Date().toISOString().slice(0, 10);
  const seed = `${plantId}${dayKey}`
    .split('')
    .reduce((sum, character) => sum + character.charCodeAt(0), 0);

  const options = MESSAGES[status];
  return options[seed % options.length];
}
