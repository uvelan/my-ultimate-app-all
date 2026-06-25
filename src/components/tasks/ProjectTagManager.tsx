"use client";

import { useState } from "react";
import { Project, Tag } from "@prisma/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { X, Trash2, Plus } from "lucide-react";
import { createProjectAction, deleteProjectAction, createTagAction, deleteTagAction } from "@/actions/project-tag-actions";
import toast from "react-hot-toast";

interface ProjectTagManagerProps {
  projects: Project[];
  tags: Tag[];
  onClose: () => void;
}

export function ProjectTagManager({ projects: initialProjects, tags: initialTags, onClose }: ProjectTagManagerProps) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [newProjectName, setNewProjectName] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    
    setIsLoading(true);
    const res = await createProjectAction({ name: newProjectName.trim(), color: "#3b82f6" });
    if (res.success && res.data) {
      setProjects([...projects, res.data as Project]);
      setNewProjectName("");
      toast.success("Project added");
    } else {
      toast.error(res.error || "Failed to add project");
    }
    setIsLoading(false);
  };

  const handleDeleteProject = async (id: string) => {
    if (!confirm("Are you sure? Tasks assigned to this project will lose their project association.")) return;
    setIsLoading(true);
    const res = await deleteProjectAction(id);
    if (res.success) {
      setProjects(projects.filter(p => p.id !== id));
      toast.success("Project deleted");
    } else {
      toast.error(res.error || "Failed to delete project");
    }
    setIsLoading(false);
  };

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    
    setIsLoading(true);
    const res = await createTagAction({ name: newTagName.trim(), color: "#8b5cf6" });
    if (res.success && res.data) {
      setTags([...tags, res.data as Tag]);
      setNewTagName("");
      toast.success("Tag added");
    } else {
      toast.error(res.error || "Failed to add tag");
    }
    setIsLoading(false);
  };

  const handleDeleteTag = async (id: string) => {
    if (!confirm("Are you sure? This tag will be removed from all tasks.")) return;
    setIsLoading(true);
    const res = await deleteTagAction(id);
    if (res.success) {
      setTags(tags.filter(t => t.id !== id));
      toast.success("Tag deleted");
    } else {
      toast.error(res.error || "Failed to delete tag");
    }
    setIsLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-radius-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-border bg-background shrink-0">
          <h2 className="text-xl font-semibold">Manage Projects & Tags</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-8">
          {/* Projects Section */}
          <div className="flex-1 space-y-4">
            <h3 className="text-lg font-medium border-b border-border pb-2">Projects</h3>
            
            <form onSubmit={handleAddProject} className="flex gap-2">
              <div className="flex-1">
                <Input 
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="New Project Name"
                  disabled={isLoading}
                />
              </div>
              <Button type="submit" disabled={isLoading || !newProjectName.trim()} variant="secondary" size="icon">
                <Plus size={18} />
              </Button>
            </form>

            <div className="space-y-2 mt-4 max-h-[300px] overflow-y-auto pr-2">
              {projects.length === 0 && (
                <p className="text-sm text-text-muted">No projects found.</p>
              )}
              {projects.map(project => (
                <div key={project.id} className="flex items-center justify-between p-3 bg-background-surface rounded-radius-md border border-border">
                  <span className="text-small font-medium">{project.name}</span>
                  <button 
                    onClick={() => handleDeleteProject(project.id)}
                    disabled={isLoading}
                    className="text-text-muted hover:text-error transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Tags Section */}
          <div className="flex-1 space-y-4">
            <h3 className="text-lg font-medium border-b border-border pb-2">Tags</h3>
            
            <form onSubmit={handleAddTag} className="flex gap-2">
              <div className="flex-1">
                <Input 
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="New Tag Name"
                  disabled={isLoading}
                />
              </div>
              <Button type="submit" disabled={isLoading || !newTagName.trim()} variant="secondary" size="icon">
                <Plus size={18} />
              </Button>
            </form>

            <div className="space-y-2 mt-4 max-h-[300px] overflow-y-auto pr-2">
              {tags.length === 0 && (
                <p className="text-sm text-text-muted">No tags found.</p>
              )}
              {tags.map(tag => (
                <div key={tag.id} className="flex items-center justify-between p-3 bg-background-surface rounded-radius-md border border-border">
                  <span className="text-small font-medium">{tag.name}</span>
                  <button 
                    onClick={() => handleDeleteTag(tag.id)}
                    disabled={isLoading}
                    className="text-text-muted hover:text-error transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-border bg-background shrink-0 flex justify-end">
          <Button onClick={onClose} variant="primary">Done</Button>
        </div>
      </div>
    </div>
  );
}
