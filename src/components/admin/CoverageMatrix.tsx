import { Card, Heading, Badge, Button, Icon } from '../../App';
import type { FreshmanCourseItem, StoreExamPaper } from '../../lib/store';
import type { ExamType } from '../../types';

export default function CoverageMatrix({
  courses,
  papers,
  onCreateWantedPaper,
}: {
  courses: FreshmanCourseItem[];
  papers: StoreExamPaper[];
  onCreateWantedPaper: (courseId: string, courseCode: string, examType: ExamType) => void;
}) {
  const getPapersForCourseAndType = (courseId: string, courseCode: string, type: ExamType) => {
    return papers.filter(
      p =>
        (p.courseId === courseId || p.courseCode === courseCode) &&
        p.examType === type &&
        p.status === 'PUBLISHED' &&
        !p.deletedAt
    );
  };

  const calculateTotalSlots = () => {
    let covered = 0;
    const total = courses.length * 3;
    courses.forEach(c => {
      (['MID', 'FINAL', 'QUIZ'] as ExamType[]).forEach(t => {
        if (getPapersForCourseAndType(c.id, c.code, t).length > 0) {
          covered++;
        }
      });
    });
    return { covered, total, percentage: Math.round((covered / total) * 100) };
  };

  const stats = calculateTotalSlots();

  return (
    <Card className="table-card">
      <div className="table-head" style={{ padding: '20px 24px', borderBottom: '1px solid var(--line)' }}>
        <div>
          <Heading level={2}>Freshman Curriculum Coverage Matrix</Heading>
          <p style={{ margin: '4px 0 0 0' }}>
            All 11 courses across Mid, Final, and Quiz exams for Woliso Campus freshman curriculum.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Badge tone={stats.percentage >= 70 ? 'success' : 'warning'}>
            {stats.covered} / {stats.total} SLOTS COVERED ({stats.percentage}%)
          </Badge>
        </div>
      </div>

      <div className="responsive-table">
        <table className="matrix-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'left', minWidth: '220px' }}>Freshman Course</th>
              <th style={{ textAlign: 'left' }}>Curriculum Scope</th>
              <th style={{ textAlign: 'center', minWidth: '150px' }}>Mid Exam</th>
              <th style={{ textAlign: 'center', minWidth: '150px' }}>Final Exam</th>
              <th style={{ textAlign: 'center', minWidth: '150px' }}>Quiz</th>
            </tr>
          </thead>
          <tbody>
            {courses.map(course => {
              const midPapers = getPapersForCourseAndType(course.id, course.code, 'MID');
              const finalPapers = getPapersForCourseAndType(course.id, course.code, 'FINAL');
              const quizPapers = getPapersForCourseAndType(course.id, course.code, 'QUIZ');

              return (
                <tr key={course.id}>
                  <td>
                    <div>
                      <strong style={{ color: 'var(--ink)' }}>{course.code}</strong>
                      <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{course.title}</div>
                    </div>
                  </td>
                  <td>
                    <Badge tone={course.isShared ? 'accent' : course.streamScope === 'NAT_SCI' ? 'neutral' : 'warning'}>
                      {course.isShared
                        ? 'Common (Shared)'
                        : course.streamScope === 'NAT_SCI'
                        ? 'Natural Science'
                        : 'Social Science'}
                    </Badge>
                  </td>

                  {/* Mid Exam Slot */}
                  <td className="matrix-cell">
                    {midPapers.length > 0 ? (
                      <span className="matrix-badge-available" title={midPapers.map(p => `${p.examYearEc || p.academicYear} E.C.`).join(', ')}>
                        <Icon name="check" size={14} /> Available ({midPapers.length})
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="matrix-badge-missing"
                        title="Click to create a wanted paper bounty for this exam"
                        onClick={() => onCreateWantedPaper(course.id, course.code, 'MID')}
                      >
                        <Icon name="plus" size={13} /> Missing · Bounty
                      </button>
                    )}
                  </td>

                  {/* Final Exam Slot */}
                  <td className="matrix-cell">
                    {finalPapers.length > 0 ? (
                      <span className="matrix-badge-available" title={finalPapers.map(p => `${p.examYearEc || p.academicYear} E.C.`).join(', ')}>
                        <Icon name="check" size={14} /> Available ({finalPapers.length})
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="matrix-badge-missing"
                        title="Click to create a wanted paper bounty for this exam"
                        onClick={() => onCreateWantedPaper(course.id, course.code, 'FINAL')}
                      >
                        <Icon name="plus" size={13} /> Missing · Bounty
                      </button>
                    )}
                  </td>

                  {/* Quiz Exam Slot */}
                  <td className="matrix-cell">
                    {quizPapers.length > 0 ? (
                      <span className="matrix-badge-available" title={quizPapers.map(p => `${p.examYearEc || p.academicYear} E.C.`).join(', ')}>
                        <Icon name="check" size={14} /> Available ({quizPapers.length})
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="matrix-badge-missing"
                        title="Click to create a wanted paper bounty for this exam"
                        onClick={() => onCreateWantedPaper(course.id, course.code, 'QUIZ')}
                      >
                        <Icon name="plus" size={13} /> Missing · Bounty
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
