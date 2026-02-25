import NoiseGenerator    from '@/components/modules/relax/noise-generator';
import ColorPicker       from '@/components/modules/relax/color-picker';
import BreathingExercise from '@/components/modules/relax/breathing-exercise';
import PomodoroTimer     from '@/components/modules/relax/pomodoro-timer';
import RelaxLayout       from '@/components/modules/relax/relax-layout';
import { getRelaxState } from '@/actions/relax';

interface CardProps {
  icon: string;
  title: string;
  children: React.ReactNode;
}

function ToolCard({ icon, title, children }: CardProps) {
  return (
    <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="material-icons-round text-xl text-[var(--muted-foreground)]">{icon}</span>
        <h2 className="font-semibold text-[var(--foreground)]">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default async function RelaxPage() {
  const relaxState = await getRelaxState();
  const hasApiKey = !!process.env.GEMINI_API_KEY;

  return (
    <RelaxLayout
      initialTheme={relaxState.theme}
      hasApiKey={hasApiKey}
      initialWaterCount={relaxState.water_count}
      initialWaterDate={relaxState.water_date}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <ToolCard icon="water_drop" title="环境噪音">
          <NoiseGenerator />
        </ToolCard>

        <ToolCard icon="palette" title="配色生成">
          <ColorPicker />
        </ToolCard>

        <ToolCard icon="air" title="4-7-8 呼吸">
          <BreathingExercise />
        </ToolCard>

        <ToolCard icon="timer" title="番茄钟">
          <PomodoroTimer />
        </ToolCard>
      </div>
    </RelaxLayout>
  );
}
