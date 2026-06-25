'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Section } from '@/components/layout/Primitives';
import { Typography } from '@/components/ui/Typography';
import { Loader2, Plus, FileText, Trash2, Edit2, Users, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useResumeStore } from '@/store/resume-builder/resumeStore';
import { useAuth } from '@/hooks/useAuth';

interface ResumeMeta {
  id: string;
  title: string;
  updatedAt: string;
  userId: string | null;
}

interface UserMeta {
  id: string;
  name: string;
  email: string;
}

export default function ResumeDashboard() {
  const { user } = useAuth();
  const isSuperUser = user?.role === 'SUPERUSER';

  const [resumes, setResumes] = useState<ResumeMeta[]>([]);
  const [users, setUsers] = useState<UserMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assigningResumeId, setAssigningResumeId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  
  const router = useRouter();
  const { setFullData } = useResumeStore();

  const fetchResumes = async () => {
    try {
      const res = await fetch('/api/resumes');
      if (res.ok) {
        const data = await res.json();
        setResumes(data);
      }
    } catch (error) {
      console.error('Failed to fetch resumes', error);
      toast.error('Failed to load resumes');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    if (!isSuperUser) return;
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Failed to fetch users', error);
    }
  };

  useEffect(() => {
    fetchResumes();
  }, []);

  useEffect(() => {
    if (isSuperUser) {
      fetchUsers();
    }
  }, [isSuperUser]);

  const handleCreateNew = () => {
    // Clear local store before creating new
    setFullData({
      id: '',
      personalInfo: { fullName: '', email: '', phone: '', location: '', linkedIn: '', gitHub: '', portfolio: '', professionalTitle: '', photoUrl: '' },
      summary: '',
      experience: [],
      education: [],
      skills: { technical: [], soft: [], tools: [], frameworks: [], platforms: [], languages: [] },
      projects: [],
      certifications: [],
      awards: [],
      publications: [],
      meta: {
        templateId: 'stitch-premium',
        customization: {
          accentColor: '#d4af37',
          fontPairing: 'modern',
          fontSizeScale: 'M',
          spacingDensity: 'balanced',
          columnLayout: '1-col',
          sectionOrder: [],
          hiddenSections: []
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isDraft: true,
      }
    });
    router.push('/resume-builder/new');
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this resume?')) return;
    try {
      const res = await fetch(`/api/resumes?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Resume deleted');
        fetchResumes();
      } else {
        toast.error('Failed to delete');
      }
    } catch (error) {
      toast.error('Error deleting resume');
    }
  };

  const openAssignModal = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (users.length === 0) {
      toast.error('No users found or you do not have permission.');
      return;
    }
    setAssigningResumeId(id);
    setSelectedUserId('');
    setAssignModalOpen(true);
  };

  const confirmAssign = async () => {
    if (!assigningResumeId || !selectedUserId) {
      toast.error('Please select a user');
      return;
    }
    try {
      const res = await fetch(`/api/resumes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: assigningResumeId, userId: selectedUserId })
      });
      if (res.ok) {
        toast.success('Resume assigned');
        fetchResumes();
        setAssignModalOpen(false);
      } else {
        toast.error('Failed to assign. You might not be a superuser.');
      }
    } catch (error) {
      toast.error('Error assigning resume');
    }
  };

  const handleRename = async (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTitle = prompt('Enter a new name for this resume:', currentTitle);
    if (!newTitle || newTitle === currentTitle) return;
    try {
      const res = await fetch(`/api/resumes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, title: newTitle })
      });
      if (res.ok) {
        toast.success('Resume renamed');
        fetchResumes();
      } else {
        toast.error('Failed to rename resume');
      }
    } catch (error) {
      toast.error('Error renaming resume');
    }
  };

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <Section className="pt-0 md:pt-0" title="Your Resumes" description="Manage your AI-crafted resumes and cover letters.">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-text-muted gap-space-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <Typography variant="small">Loading your resumes...</Typography>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-8 w-full mt-4">
              
              {/* Create New Card */}
              <button 
                onClick={handleCreateNew}
                className="group relative flex flex-col items-center justify-center h-64 rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-background-surface hover:bg-primary/5 transition-all duration-300"
              >
                <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                  <Plus className="w-8 h-8" />
                </div>
                <Typography variant="h4" className="font-semibold">Create New</Typography>
                <Typography variant="small" className="text-text-muted mt-2 text-center px-4">Start a fresh AI-powered resume from scratch</Typography>
              </button>

              {/* Resume Cards */}
              {resumes.map((resume) => (
                <div 
                  key={resume.id}
                  onClick={() => router.push(`/resume-builder/${resume.id}`)}
                  className="group cursor-pointer relative flex flex-col h-64 rounded-xl border border-border bg-background-surface overflow-hidden hover:shadow-xl hover:border-primary/50 transition-all duration-300"
                >
                  <div className="h-32 bg-gradient-to-br from-background-muted to-background flex items-center justify-center border-b border-border relative">
                    <FileText className="w-12 h-12 text-text-muted opacity-50" />
                    
                    {/* Admin Actions overlay */}
                    <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isSuperUser && users.length > 0 && (
                        <button onClick={(e) => openAssignModal(resume.id, e)} className="p-1.5 bg-background border border-border rounded-md text-blue-400 hover:bg-blue-400/10 transition-colors" title="Assign User">
                          <Users size={14} />
                        </button>
                      )}
                      <button onClick={(e) => handleRename(resume.id, resume.title, e)} className="p-1.5 bg-background border border-border rounded-md text-green-400 hover:bg-green-400/10 transition-colors" title="Rename">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={(e) => handleDelete(resume.id, e)} className="p-1.5 bg-background border border-border rounded-md text-red-400 hover:bg-red-400/10 transition-colors" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 p-5 flex flex-col justify-between">
                    <div>
                      <Typography variant="body" className="font-semibold line-clamp-2 leading-tight mb-1 group-hover:text-primary transition-colors">
                        {resume.title || 'Untitled Resume'}
                      </Typography>
                      {isSuperUser && resume.userId && <Typography variant="small" className="text-blue-400/70 text-[10px] mb-2 block">User: {resume.userId}</Typography>}
                    </div>
                    
                    <div className="flex items-center justify-between mt-auto">
                      <Typography variant="small" className="text-text-muted text-xs">
                        Updated {new Date(resume.updatedAt).toLocaleDateString()}
                      </Typography>
                      <div className="flex items-center text-primary text-xs font-semibold">
                        Edit <Edit2 className="w-3 h-3 ml-1" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </DashboardLayout>

      {/* Assign Modal */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h3 className="text-lg font-bold text-white">Assign Resume</h3>
              <button onClick={() => setAssignModalOpen(false)} className="text-text-muted hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">Select User</label>
              <select 
                className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
              >
                <option value="" disabled>-- Select a user --</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-end gap-3 p-4 border-t border-white/10 bg-[#222222]">
              <button onClick={() => setAssignModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors">
                Cancel
              </button>
              <button onClick={confirmAssign} disabled={!selectedUserId} className="px-4 py-2 text-sm font-bold text-black bg-[#d4af37] rounded-lg hover:bg-[#b5952f] transition-colors disabled:opacity-50">
                Confirm Assignment
              </button>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
