import { create } from 'zustand';

interface UiState {
  activeStep: number;
  isAiPanelOpen: boolean;
  previewMode: 'desktop' | 'mobile' | 'print';
  previewZoom: number;
  isTemplateGalleryExpanded: boolean;
  isActionBarMinimized: boolean;
  isMaskingEnabled: boolean;
  
  setActiveStep: (step: number) => void;
  setAiPanelOpen: (isOpen: boolean) => void;
  setPreviewMode: (mode: 'desktop' | 'mobile' | 'print') => void;
  setPreviewZoom: (zoom: number) => void;
  setTemplateGalleryExpanded: (isExpanded: boolean) => void;
  setActionBarMinimized: (isMinimized: boolean) => void;
  setMaskingEnabled: (isMaskingEnabled: boolean) => void;
  resetUi: () => void;
}

const initialState = {
  activeStep: 1,
  isAiPanelOpen: false,
  previewMode: 'desktop' as const,
  previewZoom: 60,
  isTemplateGalleryExpanded: false,
  isActionBarMinimized: false,
  isMaskingEnabled: false,
};

export const useUiStore = create<UiState>((set) => ({
  ...initialState,
  
  setActiveStep: (step) => set({ activeStep: step }),
  setAiPanelOpen: (isOpen) => set({ isAiPanelOpen: isOpen }),
  setPreviewMode: (mode) => set({ previewMode: mode }),
  setPreviewZoom: (zoom) => set({ previewZoom: zoom }),
  setTemplateGalleryExpanded: (isExpanded) => set({ isTemplateGalleryExpanded: isExpanded }),
  setActionBarMinimized: (isMinimized) => set({ isActionBarMinimized: isMinimized }),
  setMaskingEnabled: (isMaskingEnabled) => set({ isMaskingEnabled }),
  resetUi: () => set(initialState),
}));
