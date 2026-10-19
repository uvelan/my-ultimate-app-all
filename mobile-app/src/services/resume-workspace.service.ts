import { api } from '../lib/api-client';

export const resumeWorkspaceService = {
    async getWorkspace() {
        const [profile, resumes] = await Promise.all([api.get('/auth/profile'), api.get('/resumes')]);
        return { profile: profile.data, resumes: resumes.data };
    },
    async getModels(): Promise<{ models: any[]; notice: string }> {
        try {
            const response = await api.get('/mobile/settings');
            const models = (Array.isArray(response.data?.models) ? response.data.models : []).filter((model: any) => model.isActive);
            return { models, notice: models.length ? '' : 'AI unavailable: no active models are configured.' };
        } catch (error: any) {
            const detail = error.response?.data?.error;
            return { models: [], notice: `AI unavailable. ${typeof detail === 'string' ? detail : 'The server model settings could not be loaded. You can still edit and save resumes.'}` };
        }
    },
};
