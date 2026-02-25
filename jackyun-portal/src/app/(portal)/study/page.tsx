import { getSyllabus, getStudyConfig, getMockRecords } from '@/actions/study';
import StudyApp from '@/components/modules/study/study-app';

export default async function StudyPage() {
  const [subjects, config, mockRecords] = await Promise.all([
    getSyllabus(),
    getStudyConfig(),
    getMockRecords(),
  ]);

  return (
    <StudyApp
      initialSubjects={subjects}
      initialConfig={config}
      initialMockRecords={mockRecords}
    />
  );
}
