import { useState, useMemo, useRef } from 'react';
import { Card, Heading, Badge, Button, Icon, PageHead, Input, Select } from '../../App';
import { api } from '../../lib/api';
import { estimatePageCount } from '../../lib/pageCount';
import type { FreshmanCourseItem, StoreExamPaper } from '../../lib/store';
import type { UserSession, ExamType, ScanQuality } from '../../types';

// Helper to compute SHA-256 in the browser
async function computeSha256(file: File): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return 'sha256_' + Math.random().toString(36).substring(2) + Date.now();
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PapersManager({
  currentUser,
  courses,
  papers,
  onRefresh,
}: {
  currentUser: UserSession;
  courses: FreshmanCourseItem[];
  papers: StoreExamPaper[];
  onRefresh: () => void;
}) {
  const isVerifier = currentUser.role === 'PAYMENT_VERIFIER';

  // Tabs: 'active' or 'trash'
  const [activeTab, setActiveTab] = useState<'active' | 'trash'>('active');

  // Search & Filters
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('ALL');
  const [examTypeFilter, setExamTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [qualityFilter, setQualityFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'newest' | 'year' | 'title' | 'views'>('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Upload Modal State
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadCourseId, setUploadCourseId] = useState(courses[0]?.id || '');
  const [uploadExamType, setUploadExamType] = useState<ExamType>('FINAL');
  const [uploadYear, setUploadYear] = useState('2015');
  const [uploadQuality, setUploadQuality] = useState<ScanQuality>('EXCELLENT');
  const [uploadStatus, setUploadStatus] = useState<'PUBLISHED' | 'DRAFT' | 'HIDDEN'>('PUBLISHED');
  const [uploadIsFreeSample, setUploadIsFreeSample] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadCustomTitle, setUploadCustomTitle] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Duplicate warning state
  const [duplicateMatch, setDuplicateMatch] = useState<{
    fileName: string;
    existingPaper: any;
  } | null>(null);

  // Replace file modal
  const [replacingPaper, setReplacingPaper] = useState<StoreExamPaper | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [replacing, setReplacing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // Handle files selected for upload
  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArr = Array.from(files);
    setUploadFiles(fileArr);

    // If single file, check SHA-256 duplicate immediately
    if (fileArr.length === 1) {
      const file = fileArr[0];
      setUploadCustomTitle(file.name.replace(/\.[^/.]+$/, ''));
      try {
        const hash = await computeSha256(file);
        const check = await api.checkPaperDuplicate(hash);
        if (check.isDuplicate) {
          setDuplicateMatch({
            fileName: file.name,
            existingPaper: check.paper,
          });
        } else {
          setDuplicateMatch(null);
        }
      } catch (e) {
        console.warn('Duplicate check pre-flight failed:', e);
      }
    } else {
      setDuplicateMatch(null);
    }
  };

  // Perform upload (single or bulk)
  const handleUploadSubmit = async (force: boolean = false) => {
    if (uploadFiles.length === 0) {
      alert('Please select or drop at least one file to upload.');
      return;
    }

    setUploading(true);
    const selectedCourse = courses.find(c => c.id === uploadCourseId) || courses[0];

    try {
      for (const file of uploadFiles) {
        const dataUrl = await fileToDataUrl(file);
        const parts = dataUrl.split(',');
        const base64Data = parts[1] || parts[0];
        const mimeType = file.type || 'application/pdf';

        // ONE upload contract: browser -> authenticated POST /api/upload -> private storage -> returns storageKey + sha256
        const uploadRes = await api.uploadFile(base64Data, mimeType, 'paper');

        const title =
          uploadFiles.length === 1 && uploadCustomTitle.trim()
            ? uploadCustomTitle.trim()
            : `${selectedCourse.code} · ${uploadExamType} Exam ${uploadYear} E.C.`;

        await api.createPaper(
          {
            courseId: uploadCourseId,
            title,
            examType: uploadExamType,
            examYearEc: Number(uploadYear) || 2015,
            quality: uploadQuality,
            status: uploadStatus,
            isFreeSample: uploadIsFreeSample,
            pageCount: estimatePageCount(file.size),
            storageKey: uploadRes.storageKey,
            sha256: uploadRes.sha256,
            mimeType: uploadRes.mimeType,
            fileBytes: uploadRes.sizeBytes,
            fileName: file.name,
            force,
          },
          currentUser.userId,
          currentUser.role
        );
      }

      alert(`Successfully uploaded ${uploadFiles.length} paper(s) to the library.`);
      setUploadModalOpen(false);
      setUploadFiles([]);
      setDuplicateMatch(null);
      setUploadCustomTitle('');
      onRefresh();
    } catch (err: any) {
      if (err.details?.code === 'DUPLICATE_FILE') {
        setDuplicateMatch({
          fileName: uploadFiles[0]?.name || 'Exam Paper',
          existingPaper: err.details.existingPaper,
        });
      } else {
        alert(err.message || 'Upload failed');
      }
    } finally {
      setUploading(false);
    }
  };

  // Replace file submit
  const handleReplaceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replacingPaper || !replaceFile) return;

    setReplacing(true);
    try {
      const dataUrl = await fileToDataUrl(replaceFile);
      const parts = dataUrl.split(',');
      const base64Data = parts[1] || parts[0];
      const mimeType = replaceFile.type || 'application/pdf';

      // ONE upload contract: upload file first to /api/upload
      const uploadRes = await api.uploadFile(base64Data, mimeType, 'paper');

      await api.replacePaperFile(
        replacingPaper.id,
        {
          storageKey: uploadRes.storageKey,
          sha256: uploadRes.sha256,
          mimeType: uploadRes.mimeType,
          fileBytes: uploadRes.sizeBytes,
          fileName: replaceFile.name,
        },
        currentUser.userId,
        currentUser.role
      );

      alert(`File replaced successfully for ${replacingPaper.title}`);
      setReplacingPaper(null);
      setReplaceFile(null);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to replace file');
    } finally {
      setReplacing(false);
    }
  };

  // Status toggle
  const handleStatusChange = async (paper: StoreExamPaper, newStatus: 'PUBLISHED' | 'DRAFT' | 'HIDDEN') => {
    if (isVerifier) return;
    try {
      await api.updatePaper(paper.id, { status: newStatus }, currentUser.userId, currentUser.role);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    }
  };

  // Soft delete
  const handleDeletePaper = async (paper: StoreExamPaper) => {
    if (isVerifier) return;
    if (!confirm(`Are you sure you want to move "${paper.title}" to Trash?`)) return;

    try {
      await api.deletePaper(paper.id, currentUser.userId, currentUser.role);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to delete paper');
    }
  };

  // Restore paper
  const handleRestorePaper = async (paper: StoreExamPaper) => {
    if (isVerifier) return;
    try {
      await api.restorePaper(paper.id, currentUser.userId, currentUser.role);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to restore paper');
    }
  };

  // Filtering & Sorting
  const filteredPapers = useMemo(() => {
    return papers
      .filter(p => {
        const isDeleted = Boolean(p.deletedAt);
        if (activeTab === 'active' && isDeleted) return false;
        if (activeTab === 'trash' && !isDeleted) return false;

        if (search.trim()) {
          const q = search.toLowerCase();
          const matchTitle = p.title.toLowerCase().includes(q);
          const matchCode = (p.courseCode || '').toLowerCase().includes(q);
          const matchName = (p.courseName || '').toLowerCase().includes(q);
          if (!matchTitle && !matchCode && !matchName) return false;
        }

        if (courseFilter !== 'ALL') {
          if (p.courseId !== courseFilter && p.courseCode !== courseFilter) return false;
        }

        if (examTypeFilter !== 'ALL' && p.examType !== examTypeFilter) return false;
        if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
        if (qualityFilter !== 'ALL' && p.quality !== qualityFilter) return false;

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') return (b.academicYear || 0) - (a.academicYear || 0);
        if (sortBy === 'year') return (b.examYearEc || b.academicYear || 0) - (a.examYearEc || a.academicYear || 0);
        if (sortBy === 'title') return a.title.localeCompare(b.title);
        if (sortBy === 'views') return (b.viewsCount || 0) - (a.viewsCount || 0);
        return 0;
      });
  }, [papers, activeTab, search, courseFilter, examTypeFilter, statusFilter, qualityFilter, sortBy]);

  const totalPages = Math.ceil(filteredPapers.length / pageSize) || 1;
  const paginatedPapers = filteredPapers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const activeCount = papers.filter(p => !p.deletedAt).length;
  const trashCount = papers.filter(p => p.deletedAt).length;

  return (
    <>
      <PageHead
        eyebrow="CONTENT MANAGEMENT"
        title="Exam Papers Manager"
        text="Manage, organize, quality-check, and publish past exam papers across the 11 freshman courses."
        action={
          !isVerifier && (
            <Button icon="plus" onClick={() => setUploadModalOpen(true)}>
              Upload papers (Single / Bulk)
            </Button>
          )
        }
      />

      {isVerifier && (
        <div className="alert info" style={{ background: '#eef3f9', border: '1px solid #c2d4ea', color: '#1a4b75', marginBottom: '20px' }}>
          <Icon name="shield" size={18} />
          <span>
            <strong>Read-Only Access:</strong> As a Payment Verifier, you can view the paper catalog but cannot upload, edit, replace, or delete papers.
          </span>
        </div>
      )}

      {/* Tabs: Active vs Trash */}
      <div className="admin-tabs">
        <button
          className={`admin-tab-btn ${activeTab === 'active' ? 'active' : ''}`}
          onClick={() => { setActiveTab('active'); setCurrentPage(1); }}
        >
          Active Library ({activeCount})
        </button>
        <button
          className={`admin-tab-btn ${activeTab === 'trash' ? 'active' : ''}`}
          onClick={() => { setActiveTab('trash'); setCurrentPage(1); }}
        >
          Trash / Deleted ({trashCount})
        </button>
      </div>

      <Card className="table-card">
        {/* Search & Toolbars */}
        <div className="table-tools" style={{ padding: '16px 20px', gap: '12px', flexWrap: 'wrap' }}>
          <label style={{ flex: '1 1 260px' }}>
            <Icon name="search" />
            <input
              placeholder="Search by title, course code (e.g. FLEn 1011)..."
              value={search}
              onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
            />
          </label>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              style={{ minHeight: '40px', padding: '0 10px', borderRadius: '8px', border: '1px solid var(--line)', background: 'white' }}
              value={courseFilter}
              onChange={e => { setCourseFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="ALL">All Courses</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.code}</option>
              ))}
            </select>

            <select
              style={{ minHeight: '40px', padding: '0 10px', borderRadius: '8px', border: '1px solid var(--line)', background: 'white' }}
              value={examTypeFilter}
              onChange={e => { setExamTypeFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="ALL">All Exam Types</option>
              <option value="MID">Mid Exam</option>
              <option value="FINAL">Final Exam</option>
              <option value="QUIZ">Quiz</option>
            </select>

            <select
              style={{ minHeight: '40px', padding: '0 10px', borderRadius: '8px', border: '1px solid var(--line)', background: 'white' }}
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="ALL">All Statuses</option>
              <option value="PUBLISHED">Published</option>
              <option value="DRAFT">Draft</option>
              <option value="HIDDEN">Hidden</option>
            </select>

            <select
              style={{ minHeight: '40px', padding: '0 10px', borderRadius: '8px', border: '1px solid var(--line)', background: 'white' }}
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
            >
              <option value="newest">Sort: Newest</option>
              <option value="year">Sort: Exam Year</option>
              <option value="title">Sort: Title (A-Z)</option>
              <option value="views">Sort: Most Views</option>
            </select>
          </div>
        </div>

        {/* Papers Table */}
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>Exam Paper Title</th>
                <th>Course</th>
                <th>Type & Year</th>
                <th>Quality</th>
                <th>Access / Sample</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedPapers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                    No papers found matching the selected filters.
                  </td>
                </tr>
              ) : (
                paginatedPapers.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div>
                        <strong style={{ color: 'var(--ink)' }}>{p.title}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '2px' }}>
                          {p.pageCount || "—"} pages · {p.viewsCount || 0} views
                        </div>
                      </div>
                    </td>
                    <td>
                      <div>
                        <strong>{p.courseCode}</strong>
                        <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{p.courseName}</div>
                      </div>
                    </td>
                    <td>
                      <Badge tone={p.examType === 'FINAL' ? 'accent' : p.examType === 'MID' ? 'neutral' : 'warning'}>
                        {p.examType} · {p.examYearEc || p.academicYear} E.C.
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={p.quality === 'EXCELLENT' ? 'success' : 'neutral'}>
                        {p.quality}
                      </Badge>
                    </td>
                    <td>
                      {p.isFreeSample ? (
                        <Badge tone="success">FREE SAMPLE</Badge>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Requires Unlock</span>
                      )}
                    </td>
                    <td>
                      {isVerifier ? (
                        <Badge tone={p.status === 'PUBLISHED' ? 'success' : p.status === 'DRAFT' ? 'warning' : 'neutral'}>
                          {p.status}
                        </Badge>
                      ) : (
                        <select
                          value={p.status}
                          disabled={Boolean(p.deletedAt)}
                          onChange={e => handleStatusChange(p, e.target.value as any)}
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: '1px solid var(--line)',
                            background: p.status === 'PUBLISHED' ? 'var(--success-soft)' : p.status === 'DRAFT' ? 'var(--warning-soft)' : '#f0f0f0',
                            color: p.status === 'PUBLISHED' ? 'var(--success)' : p.status === 'DRAFT' ? 'var(--warning)' : 'inherit',
                          }}
                        >
                          <option value="PUBLISHED">PUBLISHED</option>
                          <option value="DRAFT">DRAFT</option>
                          <option value="HIDDEN">HIDDEN</option>
                        </select>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {activeTab === 'active' ? (
                          <>
                            {!isVerifier && (
                              <>
                                <Button
                                  variant="secondary"
                                  style={{ minHeight: '32px', padding: '0 8px', fontSize: '0.78rem' }}
                                  onClick={() => { setReplacingPaper(p); setReplaceFile(null); }}
                                >
                                  Replace file
                                </Button>
                                <Button
                                  variant="ghost"
                                  style={{ minHeight: '32px', padding: '0 6px', color: 'var(--danger)' }}
                                  onClick={() => handleDeletePaper(p)}
                                  title="Move to Trash"
                                >
                                  <Icon name="close" size={14} />
                                </Button>
                              </>
                            )}
                          </>
                        ) : (
                          <>
                            {!isVerifier && (
                              <Button
                                variant="secondary"
                                style={{ minHeight: '32px', padding: '0 10px', fontSize: '0.78rem' }}
                                onClick={() => handleRestorePaper(p)}
                              >
                                Restore
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--line)' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
              Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredPapers.length)} of {filteredPapers.length} papers
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant="secondary"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                style={{ minHeight: '34px', padding: '0 12px' }}
              >
                Previous
              </Button>
              <span style={{ display: 'grid', placeItems: 'center', padding: '0 8px', fontSize: '0.85rem', fontWeight: 650 }}>
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                style={{ minHeight: '34px', padding: '0 12px' }}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Upload Modal (Single / Bulk Drag-and-Drop) */}
      {uploadModalOpen && (
        <div className="modal-backdrop" onClick={() => setUploadModalOpen(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">LIBRARY INGESTION</span>
                <Heading level={2}>Upload Past Exam Papers</Heading>
              </div>
              <Button variant="ghost" onClick={() => setUploadModalOpen(false)}>
                <Icon name="close" />
              </Button>
            </div>

            <div className="modal-body">
              {/* Drag and Drop Zone */}
              <div
                className={`drop-zone ${isDragOver ? 'active' : ''}`}
                onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={e => {
                  e.preventDefault();
                  setIsDragOver(false);
                  handleFilesSelected(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,image/png,image/jpeg"
                  style={{ display: 'none' }}
                  onChange={e => handleFilesSelected(e.target.files)}
                />
                <Icon name="upload" size={32} />
                <strong style={{ fontSize: '0.95rem' }}>
                  {uploadFiles.length > 0
                    ? `${uploadFiles.length} file(s) selected: ${uploadFiles.map(f => f.name).slice(0, 3).join(', ')}${uploadFiles.length > 3 ? '...' : ''}`
                    : 'Drag & drop single or multiple exam files here, or click to browse'}
                </strong>
                <small style={{ color: 'var(--muted)' }}>
                  Accepts PDF, JPG, PNG up to 25 MB. Automatic magic-byte signature check and SHA-256 duplicate scanning enabled.
                </small>
              </div>

              {/* SHA-256 Duplicate Collision Warning Box */}
              {duplicateMatch && (
                <div className="duplicate-warning-box">
                  <Icon name="shield" size={24} />
                  <div style={{ flex: 1 }}>
                    <strong>DUPLICATE SHA-256 DETECTED</strong>
                    <p style={{ margin: '3px 0 8px 0', fontSize: '0.85rem' }}>
                      This exact file (<code>{duplicateMatch.fileName}</code>) already exists in the database as:
                      <br />
                      <b>{duplicateMatch.existingPaper?.title}</b> ({duplicateMatch.existingPaper?.course?.code || ''})
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Button
                        variant="secondary"
                        style={{ minHeight: '32px', padding: '0 10px', fontSize: '0.8rem' }}
                        onClick={() => { setUploadFiles([]); setDuplicateMatch(null); }}
                      >
                        Cancel File
                      </Button>
                      <Button
                        variant="danger"
                        style={{ minHeight: '32px', padding: '0 10px', fontSize: '0.8rem' }}
                        onClick={() => handleUploadSubmit(true)}
                      >
                        Force Upload Anyway
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Target Course and Metadata */}
              <Select label="Target Freshman Course" value={uploadCourseId} onChange={e => setUploadCourseId(e.target.value)}>
                {courses.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.title} ({c.isShared ? 'Shared' : c.streamScope === 'NAT_SCI' ? 'Nat Sci' : 'Soc Sci'})
                  </option>
                ))}
              </Select>

              {uploadFiles.length === 1 && (
                <Input
                  label="Exam Paper Title"
                  placeholder="e.g. FLEn 1011 · Final Exam 2015 E.C."
                  value={uploadCustomTitle}
                  onChange={e => setUploadCustomTitle(e.target.value)}
                />
              )}

              <div className="form-grid">
                <Select label="Exam Type" value={uploadExamType} onChange={e => setUploadExamType(e.target.value as ExamType)}>
                  <option value="MID">Mid Exam</option>
                  <option value="FINAL">Final Exam</option>
                  <option value="QUIZ">Quiz Exam</option>
                </Select>

                <Select label="Exam Year (Ethiopian Calendar)" value={uploadYear} onChange={e => setUploadYear(e.target.value)}>
                  <option value="2016">2016 E.C. (2024)</option>
                  <option value="2015">2015 E.C. (2023)</option>
                  <option value="2014">2014 E.C. (2022)</option>
                  <option value="2013">2013 E.C. (2021)</option>
                </Select>
              </div>

              <div className="form-grid">
                <Select label="Scan Quality" value={uploadQuality} onChange={e => setUploadQuality(e.target.value as ScanQuality)}>
                  <option value="EXCELLENT">EXCELLENT (Printed or High-Res Scan)</option>
                  <option value="GOOD">GOOD (Clear photograph)</option>
                  <option value="FAIR">FAIR (Legible)</option>
                </Select>

                <Select label="Initial Status" value={uploadStatus} onChange={e => setUploadStatus(e.target.value as any)}>
                  <option value="PUBLISHED">PUBLISHED (Live for students)</option>
                  <option value="DRAFT">DRAFT (Reviewing)</option>
                  <option value="HIDDEN">HIDDEN</option>
                </Select>
              </div>

              <div className="setting-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
                <div>
                  <strong style={{ fontSize: '0.9rem' }}>Mark as Free Sample Paper</strong>
                  <p style={{ fontSize: '0.78rem' }}>Allows enrolled students to view this paper without unlocking the full semester.</p>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={uploadIsFreeSample}
                    onChange={e => setUploadIsFreeSample(e.target.checked)}
                  />
                  <span />
                </label>
              </div>
            </div>

            <div className="modal-footer">
              <Button variant="secondary" onClick={() => setUploadModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => handleUploadSubmit(false)} disabled={uploading || uploadFiles.length === 0}>
                {uploading ? 'Processing & Ingesting...' : `Upload ${uploadFiles.length || 0} Paper(s)`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Replace File Modal */}
      {replacingPaper && (
        <div className="modal-backdrop" onClick={() => setReplacingPaper(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">FILE UPDATE</span>
                <Heading level={2}>Replace Paper File</Heading>
              </div>
              <Button variant="ghost" onClick={() => setReplacingPaper(null)}>
                <Icon name="close" />
              </Button>
            </div>
            <form onSubmit={handleReplaceSubmit}>
              <div className="modal-body">
                <p style={{ margin: 0 }}>
                  Replacing file for: <strong>{replacingPaper.title}</strong> ({replacingPaper.courseCode})
                </p>

                <div
                  className="drop-zone"
                  onClick={() => replaceInputRef.current?.click()}
                  style={{ padding: '24px 16px' }}
                >
                  <input
                    ref={replaceInputRef}
                    type="file"
                    accept=".pdf,image/png,image/jpeg"
                    style={{ display: 'none' }}
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) {
                        setReplaceFile(e.target.files[0]);
                      }
                    }}
                  />
                  <Icon name="upload" size={28} />
                  <strong style={{ fontSize: '0.9rem' }}>
                    {replaceFile ? replaceFile.name : 'Click to select replacement PDF or Image file'}
                  </strong>
                  <small style={{ color: 'var(--muted)' }}>
                    Recalculates SHA-256 and updates private storage.
                  </small>
                </div>
              </div>

              <div className="modal-footer">
                <Button variant="secondary" onClick={() => setReplacingPaper(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!replaceFile || replacing}>
                  {replacing ? 'Uploading...' : 'Confirm Replacement'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
