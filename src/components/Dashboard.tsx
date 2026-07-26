import React, { useState, useEffect, useRef, useMemo } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { AppConfig } from '../config/AppConfig';
import { compressConfig, decompressConfig, formatRelativeDate, Markdown, parseGitUrl } from '../lib/utils';
import '../styles/dashboard.css';
import { 
   IconMessage, 
   IconFileText, 
   IconDownload, 
   IconUpload, 
   IconSend, 
   IconFolder, 
   IconTag,
   IconLoader2,
   IconCircleCheck,
   IconCamera,
   IconRefresh,
   IconUser,
   IconVolume,
   IconVolumeOff,
       IconTrash,
       IconMicrophone,
       IconPlayerStop,
       IconQrcode,
       IconLink,
       IconPuzzle,
       IconSparkles,
       IconKey
    } from '@tabler/icons-react';

   const ONBOARDING_SUBTHEMES = [
      "literature/general",
      "literature/sci-fi",
      "literature/essays",
      "technology/programming",
      "technology/ai",
      "technology/security",
      "health/general",
      "health/biohacking",
      "health/neuroscience",
      "finance/personal",
      "finance/investment",
      "finance/economy",
      "culinary/daily",
      "culinary/pastry",
      "culinary/recipes",
      "travel/hiking",
      "travel/urban",
      "travel/exploration"
   ];

   function serializeInterests(interests: string[]): number[] {
      return interests.map(k => ONBOARDING_SUBTHEMES.indexOf(k)).filter(idx => idx !== -1);
   }

   function deserializeInterests(indices: number[]): string[] {
      return indices.map(idx => ONBOARDING_SUBTHEMES[idx]).filter(Boolean);
   }

interface ContentItemData {
   id: string;
   title?: string;
   category?: string;
   tags?: string[];
   summary?: string;
   originalFileUri?: string;
   fileHash?: string;
   source?: string;
   markdownFileUri?: string;
   createdAt?: string;
   documentDate?: string;
   contextNote?: string;
   body?: string;
   links?: string[];
   backlinks?: { id: string; title: string; category: string }[];
}

interface Message {
   role: 'user' | 'assistant';
   content: string;
   devStats?: {
      responseTimeMs?: number;
      ioTimeMs?: number;
      aiTimeMs?: number;
      metadataDocsCount?: number;
      fullDocsCount?: number;
      inputTokensEstimate?: number;
      outputTokensEstimate?: number;
   };
}

interface DashboardProps {
   initialDevMode?: boolean;
   defaultElevenLabsApiKey?: string;
   defaultElevenLabsVoiceId?: string;
}

export default function Dashboard({ 
   initialDevMode = false,
   defaultElevenLabsApiKey = '',
   defaultElevenLabsVoiceId = 'bVsJfghVbJypxgwVISO3'
}: DashboardProps) {
   const [activeTab, setActiveTab] = useState<'chat' | 'docs' | 'stats'>('chat');
   const [statsMode, setStatsMode] = useState<'table' | 'categories' | 'performance'>('table');
   const [documents, setDocuments] = useState<ContentItemData[]>([]);
   const [uploading, setUploading] = useState(false);
   const [uploadSuccess, setUploadSuccess] = useState(false);
   const [selectedDoc, setSelectedDoc] = useState<ContentItemData | null>(null);    
   const [categoryFilter, setCategoryFilter] = useState<string>('all');
   const [showUploadModal, setShowUploadModal] = useState(false);
   const [showQueueModal, setShowQueueModal] = useState(false);    
   const [isTestingKey, setIsTestingKey] = useState(false);
   const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

   useEffect(() => {
      if (notification) {
         const timer = setTimeout(() => setNotification(null), 5000);
         return () => clearTimeout(timer);
      }
   }, [notification]);

   const handleTestApiKey = async () => {
      setIsTestingKey(true);
      try {
         const res = await fetch('/api/test-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: llmApiKey })
         });
         const data = await res.json();
         if (res.ok && data.success) {
            setNotification({
               message: `🟢 ${data.message}`,
               type: 'success'
            });
         } else {
            setNotification({
               message: `🔴 ${data.error || 'Clé API invalide.'}`,
               type: 'error'
            });
         }
      } catch (err: any) {
         setNotification({
            message: `Erreur de connexion : ${err.message}`,
            type: 'error'
         });
      } finally {
         setIsTestingKey(false);
      }
   };

   const [showSkillsModal, setShowSkillsModal] = useState(false);
   const [skillsData, setSkillsData] = useState<any>(null);
   const [skillFormValues, setSkillFormValues] = useState<Record<string, Record<string, any>>>({});
   const [testingSkillAlias, setTestingSkillAlias] = useState<string | null>(null);
   const [jellyfinLibraries, setJellyfinLibraries] = useState<any[]>([]);
   const [isDetectingLibraries, setIsDetectingLibraries] = useState(false);

   const fetchSkillsData = async () => {
      try {
         const res = await fetch('/api/skills');
         if (res.ok) {
            const data = await res.json();
            setSkillsData(data);

            // Populate form values from manifest defaults and server values
            if (data.skills && Array.isArray(data.skills)) {
               const initialValues: Record<string, Record<string, any>> = {};
               for (const skill of data.skills) {
                  const alias = skill.alias;
                  initialValues[alias] = { ...skill.values };
                  // Fill defaults for missing fields
                  if (skill.manifest?.fields) {
                     for (const field of skill.manifest.fields) {
                        if (initialValues[alias][field.name] === undefined && field.default !== undefined) {
                           initialValues[alias][field.name] = field.default;
                        }
                     }
                  }
               }
               setSkillFormValues(prev => ({ ...initialValues, ...prev }));
            }
         }
      } catch (err) {
         console.error('Failed to fetch skills', err);
      }
   };

   const handleFieldChange = (skillAlias: string, fieldName: string, value: any) => {
      setSkillFormValues(prev => ({
         ...prev,
         [skillAlias]: {
            ...(prev[skillAlias] || {}),
            [fieldName]: value
         }
      }));
   };

   const handleTestSkill = async (skillAlias: string) => {
      setTestingSkillAlias(skillAlias);
      try {
         const values = skillFormValues[skillAlias] || {};
         const res = await fetch('/api/skills', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
               action: 'test_skill',
               skillAlias,
               values
            })
         });
         const data = await res.json();
         if (res.ok && data.success) {
            setNotification({ message: `🟢 ${data.message || 'Connexion réussie au skill !'}`, type: 'success' });
            fetchSkillsData();
         } else {
            setNotification({ message: `🔴 ${data.error || 'Test de connexion échoué.'}`, type: 'error' });
         }
      } catch (err: any) {
         setNotification({ message: `Erreur : ${err.message}`, type: 'error' });
      } finally {
         setTestingSkillAlias(null);
      }
   };

   const handleSaveSkillConfig = async (skillAlias: string) => {
      try {
         const values = skillFormValues[skillAlias] || {};
         const res = await fetch('/api/skills', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
               action: 'save_skill_config',
               skillAlias,
               values
            })
         });
         const data = await res.json();
         if (res.ok && data.success) {
            setNotification({ message: `🟢 ${data.message || 'Configuration enregistrée avec succès !'}`, type: 'success' });
            fetchSkillsData();
            setShowSkillsModal(false);
         } else {
            setNotification({ message: `🔴 ${data.error}`, type: 'error' });
         }
      } catch (err: any) {
         setNotification({ message: `Erreur : ${err.message}`, type: 'error' });
      }
   };

   const handleDetectJellyfinLibraries = async () => {
      setIsDetectingLibraries(true);
      try {
         const jellyfinValues = skillFormValues['jellyfin'] || {};
         const res = await fetch('/api/skills', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
               action: 'detect_libraries',
               skillAlias: 'jellyfin',
               ...jellyfinValues
            })
         });
         const data = await res.json();
         if (res.ok && data.libraries) {
            setJellyfinLibraries(data.libraries);
            setNotification({ message: `🟢 ${data.libraries.length} dossier(s) média détecté(s).`, type: 'success' });
         } else {
            setNotification({ message: `🔴 ${data.error || 'Impossible de lister les dossiers.'}`, type: 'error' });
         }
      } catch (err: any) {
         setNotification({ message: `Erreur : ${err.message}`, type: 'error' });
      } finally {
         setIsDetectingLibraries(false);
      }
   };

   const handleReprocessDocument = async (doc: ContentItemData) => {
      if (!doc || !doc.id) return;
      setIsReprocessing(true);
      try {
         const res = await fetch('/api/reprocess', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: doc.id, contextNote: doc.contextNote })
         });
         const data = await res.json();
         if (res.ok && data.success) {
            setNotification({
               message: `Analyse IA réussie ! ${data.properNouns?.length || 0} entité(s) / artiste(s) extrait(s).`,
               type: 'success'
            });
            if (data.item) {
               setSelectedDoc(data.item);
            }
            await fetchDocuments();
         } else {
            setNotification({
               message: data.error || 'Erreur lors du traitement du document.',
               type: 'error'
            });
         }
      } catch (err: any) {
         setNotification({
            message: err.message || 'Erreur de connexion.',
            type: 'error'
         });
      } finally {
         setIsReprocessing(false);
      }
   };

   const statsData = useMemo(() => {
      let totalLinks = 0;
      let totalWords = 0;
      let mediaCount = 0;
      const catCount: Record<string, number> = {};

      documents.forEach(doc => {
         const cat = doc.category || 'inbox';
         catCount[cat] = (catCount[cat] || 0) + 1;

         if (doc.body) {
            const links = doc.body.match(/\[.*?\]\(.*?\)/g);
            if (links) totalLinks += links.length;

            const words = doc.body.trim().split(/\s+/).filter(Boolean);
            totalWords += words.length;
         }

         if (doc.originalFileUri || doc.type === 'pdf' || doc.type === 'image' || doc.type === 'audio') {
            mediaCount++;
         }
      });

      const sortedCats = Object.entries(catCount).sort((a, b) => b[1] - a[1]);
      const topCategory = sortedCats.length > 0 ? `${sortedCats[0][0]} (${sortedCats[0][1]} doc${sortedCats[0][1] > 1 ? 's' : ''})` : 'Aucune';

      return {
         totalDocs: documents.length,
         totalLinks,
         totalWords,
         mediaCount,
         catCount,
         topCategory
      };
   }, [documents]);

   const [hoveredNode, setHoveredNode] = useState<any>(null);

   const graphData = useMemo(() => {
      if (documents.length === 0) return { nodes: [], edges: [] };

      const width = 600;
      const height = 340;
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) / 2 - 50;

      const categoryColors: Record<string, string> = {
         'technology/ai': '#38bdf8',
         'literature/general': '#c084fc',
         'health/general': '#22c55e',
         'inbox': '#fbbf24',
         'work': '#f97316',
         'personal': '#ec4899'
      };

      const nodes = documents.map((doc, idx) => {
         const angle = (idx / documents.length) * 2 * Math.PI - Math.PI / 2;
         const x = centerX + radius * Math.cos(angle);
         const y = centerY + radius * Math.sin(angle);
         const color = categoryColors[doc.category || 'inbox'] || 'var(--color-vivid-green)';
         return {
            id: doc.id,
            title: doc.title || doc.id,
            category: doc.category || 'inbox',
            summary: doc.summary || (doc.body ? doc.body.substring(0, 120) + '...' : 'Aucune description'),
            date: doc.documentDate || doc.createdAt,
            color,
            x,
            y,
            doc
         };
      });

      const edges: { sourceId: string; targetId: string; x1: number; y1: number; x2: number; y2: number; isDirect: boolean }[] = [];

      nodes.forEach((node, i) => {
         const body = node.doc.body || '';
         nodes.forEach((otherNode, j) => {
            if (i < j) {
               const isDirectLink = body.includes(otherNode.id) || (otherNode.doc.body && otherNode.doc.body.includes(node.id));
               const isSameCategory = node.category === otherNode.category;

               if (isDirectLink || isSameCategory) {
                  edges.push({
                     sourceId: node.id,
                     targetId: otherNode.id,
                     x1: node.x,
                     y1: node.y,
                     x2: otherNode.x,
                     y2: otherNode.y,
                     isDirect: isDirectLink
                  });
               }
            }
         });
      });

      return { nodes, edges };
   }, [documents]);
   const [isDictating, setIsDictating] = useState(false);
   const recognitionRef = useRef<any>(null);
   const mediaRecorderChatRef = useRef<MediaRecorder | null>(null);
   const audioChunksChatRef = useRef<BlobPart[]>([]);
   const shouldSpeakNextRef = useRef(false);
   const [reindexing, setReindexing] = useState(false);
   const [syncingGit, setSyncingGit] = useState(false);
   const [queueTasks, setQueueTasks] = useState<any[]>([]);
   const [crawlDepth, setCrawlDepth] = useState<number>(0);
   const [devMode, setDevMode] = useState<boolean>(initialDevMode);
   const [showRawViewer, setShowRawViewer] = useState<boolean>(false);
   const [docToDelete, setDocToDelete] = useState<ContentItemData | null>(null);
   const [showProfileModal, setShowProfileModal] = useState<boolean>(false);
   const [loading, setLoading] = useState(true);
   const [userProfile, setUserProfile] = useState({
      name: '',
      email: '',
      language: 'fr_FR',
      ttsProvider: 'Browser',
      elevenLabsApiKey: defaultElevenLabsApiKey,
      elevenLabsVoiceId: defaultElevenLabsVoiceId
   });

   const [configured, setConfigured] = useState(false);
   const [wizardStep, setWizardStep] = useState(1);
   const [onboardingMode, setOnboardingMode] = useState<'simple' | 'expert'>('simple');
   const [showQrModal, setShowQrModal] = useState(false);
   const [qrModalZoomed, setQrModalZoomed] = useState(false);

   // Onboarding config form states
   const [nameInput, setNameInput] = useState('');
   const [emailInput, setEmailInput] = useState('');
   const [langInput, setLangInput] = useState('fr_FR');
   const [llmProvider, setLlmProvider] = useState<'gemini' | 'llama'>('gemini');
   const [llmModel, setLlmModel] = useState('gemini-2.5-flash');
   const [llamaEndpoint, setLlamaEndpoint] = useState('http://10.0.2.2:8080/v1');
   const [llmApiKey, setLlmApiKey] = useState('');

   const [okfType, setOkfType] = useState<'local' | 'github'>('local');
   const [githubToken, setGithubToken] = useState('');
   const [githubClientId, setGithubClientId] = useState('');
   const [gitUrl, setGitUrl] = useState('');
   const [repoOwner, setRepoOwner] = useState('');
   const [repoName, setRepoName] = useState('');
   const [repoBranch, setRepoBranch] = useState('main');
   const [repoStatus, setRepoStatus] = useState<'idle' | 'checking' | 'found' | 'not_found' | 'creating' | 'created' | 'error'>('idle');
   const [repoErrorMsg, setRepoErrorMsg] = useState('');

   const [blobType, setBlobType] = useState<'local' | 's3'>('local');
   const [s3AccessKey, setS3AccessKey] = useState('');
   const [s3SecretKey, setS3SecretKey] = useState('');
   const [s3Region, setS3Region] = useState('us-east-1');
   const [s3Endpoint, setS3Endpoint] = useState('');
   const [s3Bucket, setS3Bucket] = useState('second-brain');

   // QR code states
   const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
   const [isScanning, setIsScanning] = useState(false);
   const [showExportConfig, setShowExportConfig] = useState(false);

   const videoRef = useRef<HTMLVideoElement | null>(null);
   const canvasRef = useRef<HTMLCanvasElement | null>(null);

   const [importType, setImportType] = useState<'pdf' | 'image' | 'url' | 'text' | 'audio'>('pdf');
   const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
   const [urlInput, setUrlInput] = useState('');
   const [markdownInput, setMarkdownInput] = useState('');
   const [contextNoteInput, setContextNoteInput] = useState('');
   const [addingUrl, setAddingUrl] = useState(false);
   const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
   const [expandedInterests, setExpandedInterests] = useState<string[]>([]);
   const [onboardingOptions, setOnboardingOptions] = useState<any[]>([]);
   const [initializing, setInitializing] = useState(false);
   const [messages, setMessages] = useState<Message[]>([
      { role: 'assistant', content: `Bonjour ! Je suis ${AppConfig.name}. Vous pouvez uploader des PDFs dans l'onglet "Documents" pour que je puisse les synthétiser et y accéder, ou simplement me poser des questions.` }
   ]);
   const [inputMessage, setInputMessage] = useState('');
   const [sending, setSending] = useState(false);
   const chatEndRef = useRef<HTMLDivElement>(null);
   const [selectedFile, setSelectedFile] = useState<File | null>(null);

   // Audio recording state & handlers
   const [recording, setRecording] = useState(false);
   const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
   const [audioUrl, setAudioUrl] = useState<string>('');
   const [recordingSeconds, setRecordingSeconds] = useState(0);
   const mediaRecorderRef = useRef<MediaRecorder | null>(null);
   const recordingIntervalRef = useRef<any>(null);

   useEffect(() => {
      const stored = localStorage.getItem('sb_user_profile');
      if (stored) {
         try {
            const parsed = JSON.parse(stored);
            setUserProfile(prev => ({
               ...prev,
               ...parsed,
               elevenLabsApiKey: parsed.elevenLabsApiKey || defaultElevenLabsApiKey,
               elevenLabsVoiceId: parsed.elevenLabsVoiceId || defaultElevenLabsVoiceId
            }));
         } catch (e) {
            // ignore
         }
      } else {
         setUserProfile(prev => ({
            ...prev,
            elevenLabsApiKey: defaultElevenLabsApiKey,
            elevenLabsVoiceId: defaultElevenLabsVoiceId
         }));
      }
   }, [defaultElevenLabsApiKey, defaultElevenLabsVoiceId]);

   const applyImportedConfig = async (config: any) => {
      try {
         // 1. Update React state inputs
         if (config.name) setNameInput(config.name);
         if (config.email) setEmailInput(config.email || '');
         if (config.lang) setLangInput(config.lang);
         if (config.llm) {
            if (config.llm.provider) setLlmProvider(config.llm.provider);
            if (config.llm.model) setLlmModel(config.llm.model);
            if (config.llm.apiKey) setLlmApiKey(config.llm.apiKey);
            if (config.llm.llamaEndpoint) setLlamaEndpoint(config.llm.llamaEndpoint);
         }
         if (config.okfStorage) {
            if (config.okfStorage.type) setOkfType(config.okfStorage.type);
            if (config.okfStorage.githubToken) setGithubToken(config.okfStorage.githubToken);
            if (config.okfStorage.gitUrl) {
               setGitUrl(config.okfStorage.gitUrl);
               const parsed = parseGitUrl(config.okfStorage.gitUrl);
               if (parsed) {
                  setRepoOwner(parsed.owner);
                  setRepoName(parsed.repo);
               }
            } else {
               if (config.okfStorage.repoOwner) setRepoOwner(config.okfStorage.repoOwner);
               if (config.okfStorage.repoName) setRepoName(config.okfStorage.repoName);
            }
            setRepoBranch(config.okfStorage.branch || 'main');
         }
         if (config.blobStorage) {
            if (config.blobStorage.type) setBlobType(config.blobStorage.type);
            if (config.blobStorage.accessKey) setS3AccessKey(config.blobStorage.accessKey);
            if (config.blobStorage.secretKey) setS3SecretKey(config.blobStorage.secretKey);
            if (config.blobStorage.region) setS3Region(config.blobStorage.region);
            if (config.blobStorage.endpoint) setS3Endpoint(config.blobStorage.endpoint);
            if (config.blobStorage.bucket) setS3Bucket(config.blobStorage.bucket);
         }
         if (config.interests) {
            if (Array.isArray(config.interests)) {
               setSelectedInterests(config.interests);
            }
         }

         // 2. Build full config to post to backend
         const configObj = {
            lang: config.lang || 'fr_FR',
            name: config.name || '',
            email: config.email || '',
            llm: {
               provider: config.llm?.provider || (config.llm?.model?.includes('gemma') || config.llm?.model?.includes('llama') ? 'llama' : 'gemini'),
               model: config.llm?.model || 'gemini-2.5-flash',
               apiKey: config.llm?.apiKey || '',
               llamaEndpoint: config.llm?.llamaEndpoint || 'http://10.0.2.2:8080/v1'
            },
            okfStorage: {
               type: config.okfStorage?.type || 'local',
               githubToken: config.okfStorage?.githubToken || '',
               repoOwner: config.okfStorage?.repoOwner || (config.okfStorage?.gitUrl ? parseGitUrl(config.okfStorage.gitUrl)?.owner : '') || '',
               repoName: config.okfStorage?.repoName || (config.okfStorage?.gitUrl ? parseGitUrl(config.okfStorage.gitUrl)?.repo : '') || '',
               gitUrl: config.okfStorage?.gitUrl || '',
               branch: config.okfStorage?.branch || 'main'
            },
            blobStorage: {
               type: config.blobStorage?.type || 'local',
               accessKey: config.blobStorage?.accessKey || '',
               secretKey: config.blobStorage?.secretKey || '',
               region: config.blobStorage?.region || 'us-east-1',
               endpoint: config.blobStorage?.endpoint || '',
               bucket: config.blobStorage?.bucket || 'second-brain'
            }
         };

         const configRes = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(configObj)
         });

         if (!configRes.ok) {
            const err = await configRes.json();
            alert(`Erreur d'importation backend : ${err.error}`);
            return;
         }

         // Initialize folders if interests are selected
         const interests = config.interests || [];
         if (interests.length > 0) {
            await fetch('/api/initialize', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ categories: interests })
            });
         }

         // 3. Persist local profile and change view mode to configured
         const newProfile = {
            name: config.name || '',
            email: config.email || '',
            language: config.lang || 'fr_FR',
            ttsProvider: config.ttsProvider || userProfile.ttsProvider || 'Browser',
            elevenLabsApiKey: config.elevenLabsApiKey || userProfile.elevenLabsApiKey || defaultElevenLabsApiKey,
            elevenLabsVoiceId: config.elevenLabsVoiceId || userProfile.elevenLabsVoiceId || defaultElevenLabsVoiceId
         };
         setUserProfile(newProfile);
         localStorage.setItem('sb_user_profile', JSON.stringify(newProfile));
         localStorage.setItem('sb_app_configured', 'true');
         setConfigured(true);
         
         // Fetch fresh data
         fetchDocuments();
         fetchQueue();
         
         alert("Configuration importée et appliquée avec succès !");
      } catch (err: any) {
         console.error('Failed to apply imported configuration', err);
         alert("Erreur lors de l'application de la configuration : " + err.message);
      }
   };

   useEffect(() => {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('token') || urlParams.get('github_token');
      if (token) {
         setGithubToken(token);
         setOkfType('github');
         
         fetch('https://api.github.com/user', {
            headers: {
               'Authorization': `Bearer ${token}`,
               'Accept': 'application/json'
            }
         })
         .then(res => res.json())
         .then(userData => {
            if (userData && userData.login) {
               setRepoOwner(userData.login);
               setRepoName(prev => {
                  const name = prev || 'second-brain-data';
                  setGitUrl(`https://github.com/${userData.login}/${name}.git`);
                  return name;
               });
            }
         })
         .catch(err => {
            console.error('Failed to fetch Github user profile:', err);
         });

         const cleanUrl = window.location.origin + window.location.pathname + window.location.hash;
         window.history.replaceState({}, document.title, cleanUrl);
      }
   }, []);

      useEffect(() => {
         if (AppConfig.apiMode === 'native-bridge' && typeof window !== 'undefined' && (window as any).ReactNativeWebView) {
            console.log('[WebView Bridge] Activating local fetch interceptor...');
            const originalFetch = window.fetch;
            const pendingRequests: Record<string, {
               resolve: (res: Response) => void;
               reject: (err: Error) => void;
               streamController?: ReadableStreamDefaultController;
            }> = {};
            (window as any).__pendingRequests = pendingRequests;

            window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
               const url = typeof input === 'string' ? input : (input as any).url || '';

               const isNativeRoute = 
                url.startsWith('/api/config') ||
                url.startsWith('/api/initialize') ||
                url.startsWith('/api/content') ||
                url.startsWith('/api/queue') ||
                url.startsWith('/api/upload') ||
                url.startsWith('/api/chat') ||
                url.startsWith('/api/git-sync') ||
                url.startsWith('/api/reindex');
             
             if (isNativeRoute) {
                  if (url.startsWith('/api/chat')) {
                     return new Promise<Response>((resolve) => {
                        const requestId = Math.random().toString(36).substring(7);
                        let streamController: ReadableStreamDefaultController | undefined;

                        const readableStream = new ReadableStream({
                           start(controller) {
                              streamController = controller;
                           }
                        });

                        pendingRequests[requestId] = {
                           resolve: () => {},
                           reject: () => {},
                           streamController
                        };

                        let bodyStr = '';
                        if (init?.body) {
                           bodyStr = typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
                        }

                        if ((window as any).ReactNativeWebView) {
                           (window as any).ReactNativeWebView.postMessage(JSON.stringify({
                              type: 'API_REQUEST',
                              requestId,
                              url,
                              method: init?.method || 'GET',
                              body: bodyStr
                           }));
                        }

                        resolve(new Response(readableStream, {
                           status: 200,
                           headers: { 'Content-Type': 'text/event-stream' }
                        }));
                     });
                  }

                  return new Promise<Response>((resolve, reject) => {
                     const requestId = Math.random().toString(36).substring(7);
                     pendingRequests[requestId] = { resolve, reject };

                     let bodyStr = '';
                     if (init?.body) {
                        if (typeof init.body === 'string') {
                           bodyStr = init.body;
                        } else {
                           try {
                              bodyStr = JSON.stringify(init.body);
                           } catch (e) {
                              bodyStr = String(init.body);
                           }
                        }
                     }

                     if ((window as any).ReactNativeWebView) {
                        (window as any).ReactNativeWebView.postMessage(JSON.stringify({
                           type: 'API_REQUEST',
                           requestId,
                           url,
                           method: init?.method || 'GET',
                           body: bodyStr
                        }));
                     } else {
                        originalFetch(input, init).then(resolve).catch(reject);
                     }
                  });
               }
               return originalFetch(input, init);
            };

            (window as any).__handleApiResponse = (requestId: string, status: number, dataStr: string) => {
               const req = pendingRequests[requestId];
               if (req) {
                  delete pendingRequests[requestId];
                  let responseData = {};
                  try {
                     responseData = JSON.parse(dataStr);
                  } catch (e) {
                     responseData = { raw: dataStr };
                  }

                  const response = new Response(JSON.stringify(responseData), {
                     status,
                     headers: { 'Content-Type': 'application/json' }
                  });
                  req.resolve(response);
               }
            };

            (window as any).__handleApiStreamChunk = (requestId: string, chunkStr: string) => {
               const req = pendingRequests[requestId];
               if (req && req.streamController) {
                  const encoder = new TextEncoder();
                  req.streamController.enqueue(encoder.encode(chunkStr));
               }
            };

            (window as any).__handleApiStreamEnd = (requestId: string) => {
               const req = pendingRequests[requestId];
               if (req) {
                  if (req.streamController) {
                     try {
                        req.streamController.close();
                     } catch (e) {}
                  }
                  delete pendingRequests[requestId];
               }
            };

            const handleAnchorClick = (e: MouseEvent) => {
               let target = e.target as HTMLElement | null;
               while (target && target.tagName !== 'A') {
                  target = target.parentElement;
               }
               if (target && target.getAttribute('href') === '/api/export-csv') {
                  e.preventDefault();
                  if ((window as any).ReactNativeWebView) {
                     (window as any).ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'EXPORT_CSV'
                     }));
                  }
               }
            };
            window.addEventListener('click', handleAnchorClick);

            return () => {
               window.fetch = originalFetch;
               window.removeEventListener('click', handleAnchorClick);
            };
         }
      }, []);

      useEffect(() => {
      const getCookie = (name: string) => {
         const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
         return match ? match[2] : null;
      };
      const savedDevMode = getCookie('sb_dev_mode');
      if (savedDevMode === 'true') {
         setDevMode(true);
      } else if (savedDevMode === 'false') {
         setDevMode(false);
      }
   }, []);

   useEffect(() => {
      const handleHashChange = () => {
         const hash = window.location.hash;
         if (!hash) {
            window.location.hash = '#/chat';
            return;
         }

         if (hash.startsWith('#/docs/')) {
            const docId = hash.substring(7);
            setActiveTab('docs');
            if (documents.length > 0) {
               const doc = documents.find(d => d.id === docId);
               if (doc) {
                  setSelectedDoc(doc);
               }
            }
         } else if (hash === '#/docs') {
            setActiveTab('docs');
            setSelectedDoc(null);
         } else if (hash === '#/chat') {
            setActiveTab('chat');
            setSelectedDoc(null);
         } else if (hash === '#/stats') {
            setActiveTab('stats');
            setSelectedDoc(null);
         }
      };

      window.addEventListener('hashchange', handleHashChange);
      handleHashChange();

      return () => {
         window.removeEventListener('hashchange', handleHashChange);
      };
   }, [documents]);

   useEffect(() => {
      if (activeTab === 'docs') {
         if (selectedDoc) {
            const targetHash = `#/docs/${selectedDoc.id}`;
            if (window.location.hash !== targetHash) {
               window.location.hash = targetHash;
            }
         } else {
            const targetHash = '#/docs';
            if (window.location.hash !== targetHash) {
               window.location.hash = targetHash;
            }
         }
      } else if (activeTab === 'chat') {
         const targetHash = '#/chat';
         if (window.location.hash !== targetHash) {
            window.location.hash = targetHash;
         }
      } else if (activeTab === 'stats') {
         const targetHash = '#/stats';
         if (window.location.hash !== targetHash) {
            window.location.hash = targetHash;
         }
      }
   }, [activeTab, selectedDoc]);

   const [showLlmModal, setShowLlmModal] = useState<boolean>(false);
   const [modalLlmProvider, setModalLlmProvider] = useState<'gemini' | 'llama'>('gemini');
   const [modalLlmModel, setModalLlmModel] = useState<string>('gemini-2.5-flash');
   const [modalLlmApiKey, setModalLlmApiKey] = useState<string>('');
   const [modalLlamaEndpoint, setModalLlamaEndpoint] = useState<string>('http://localhost:11434');
   const [isTestingLlmInModal, setIsTestingLlmInModal] = useState<boolean>(false);
   const [llmTestStatusInModal, setLlmTestStatusInModal] = useState<{ success: boolean; message: string } | null>(null);

   const [modalName, setModalName] = useState<string>('');
   const [modalEmail, setModalEmail] = useState<string>('');
   const [modalLanguage, setModalLanguage] = useState<string>('Français');
   const [modalTtsProvider, setModalTtsProvider] = useState<string>('Browser');
   const [modalElevenLabsApiKey, setModalElevenLabsApiKey] = useState<string>('');
   const [modalElevenLabsVoiceId, setModalElevenLabsVoiceId] = useState<string>('bVsJfghVbJypxgwVISO3');

   const [searchQuery, setSearchQuery] = useState<string>('');
   const [showCategoryModal, setShowCategoryModal] = useState<boolean>(false);
   const [showClassifyModal, setShowClassifyModal] = useState<boolean>(false);
   const [customCategoryInput, setCustomCategoryInput] = useState<string>('');

   useEffect(() => {
      if (showLlmModal) {
         setLlmTestStatusInModal(null);
         fetch('/api/config').then(r => r.ok ? r.json() : null).then(cfg => {
            if (cfg && cfg.llm) {
               setModalLlmProvider(cfg.llm.provider || 'gemini');
               setModalLlmModel(cfg.llm.model || 'gemini-2.5-flash');
               setModalLlmApiKey(cfg.llm.apiKey || '');
               setModalLlamaEndpoint(cfg.llm.llamaEndpoint || 'http://localhost:11434');
            }
         }).catch(() => {});
      }
   }, [showLlmModal]);

   const handleSaveLlmConfig = async () => {
      setShowLlmModal(false);
      try {
         const res = await fetch('/api/config');
         if (res.ok) {
            const currentConfig = await res.json();
            const updatedConfig = {
               ...currentConfig,
               llm: {
                  provider: modalLlmProvider,
                  model: modalLlmModel,
                  apiKey: modalLlmApiKey,
                  llamaEndpoint: modalLlamaEndpoint
               }
            };
            await fetch('/api/config', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify(updatedConfig)
            });
            setNotification({
               message: '🟢 Configuration du moteur IA enregistrée avec succès !',
               type: 'success'
            });
         }
      } catch (err: any) {
         setNotification({
            message: `Erreur d'enregistrement : ${err.message}`,
            type: 'error'
         });
      }
   };

   const handleTestLlmInModal = async () => {
      setIsTestingLlmInModal(true);
      setLlmTestStatusInModal(null);
      try {
         if (modalLlmProvider === 'gemini') {
            const res = await fetch('/api/test-key', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ apiKey: modalLlmApiKey })
            });
            const data = await res.json();
            if (res.ok && data.success) {
               setLlmTestStatusInModal({ success: true, message: data.message || 'Clé API Gemini validée !' });
            } else {
               setLlmTestStatusInModal({ success: false, message: data.error || 'Clé API invalide.' });
            }
         } else {
            const res = await fetch(`${modalLlamaEndpoint}/v1/models`).catch(() => null);
            if (res && res.ok) {
               setLlmTestStatusInModal({ success: true, message: 'Moteur LLM Local accessible !' });
            } else {
               setLlmTestStatusInModal({ success: false, message: `Impossible de contacter l'endpoint local (${modalLlamaEndpoint})` });
            }
         }
      } catch (err: any) {
         setLlmTestStatusInModal({ success: false, message: `Erreur de connexion : ${err.message}` });
      } finally {
         setIsTestingLlmInModal(false);
      }
   };

   useEffect(() => {
      if (showProfileModal) {
         setModalName(userProfile.name);
         setModalEmail(userProfile.email);
         setModalLanguage(userProfile.language);
         setModalTtsProvider(userProfile.ttsProvider || 'Browser');
         setModalElevenLabsApiKey(userProfile.elevenLabsApiKey || '');
         setModalElevenLabsVoiceId(userProfile.elevenLabsVoiceId || 'bVsJfghVbJypxgwVISO3');
      }
   }, [showProfileModal, userProfile]);

   const handleSaveProfile = async (profile: typeof userProfile) => {
      setUserProfile(profile);
      localStorage.setItem('sb_user_profile', JSON.stringify(profile));
      setShowProfileModal(false);
      
      // Save to backend config as well to keep in sync
      try {
         const res = await fetch('/api/config');
         if (res.ok) {
            const currentConfig = await res.json();
            const updatedConfig = {
               ...currentConfig,
               name: profile.name,
               email: profile.email,
               lang: profile.language
            };
            await fetch('/api/config', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify(updatedConfig)
            });
            setNotification({
               message: '🟢 Profil et préférences enregistrés avec succès !',
               type: 'success'
            });
         }
      } catch (err) {
         console.error('Failed to sync profile changes to backend config', err);
      }
   };

    const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
    const activeAudioRef = useRef<HTMLAudioElement | null>(null);
    const unlockedAudioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
       if (AppConfig.apiMode === 'native-bridge') {
          console.log('[WebView Bridge] Activating local fetch interceptor...');
          const originalFetch = window.fetch;
          const pendingRequests: Record<string, { resolve: (res: Response) => void; reject: (err: Error) => void }> = {};
          (window as any).__pendingRequests = pendingRequests;
          
          window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
             const url = typeof input === 'string' ? input : (input as any).url || '';
             
             const isNativeRoute = 
                url.startsWith('/api/config') ||
                url.startsWith('/api/initialize') ||
                url.startsWith('/api/content') ||
                url.startsWith('/api/queue') ||
                url.startsWith('/api/upload') ||
                url.startsWith('/api/chat') ||
                url.startsWith('/api/git-sync') ||
                url.startsWith('/api/reindex');
             
             if (isNativeRoute) {
                return new Promise<Response>((resolve, reject) => {
                   const requestId = Math.random().toString(36).substring(7);
                   pendingRequests[requestId] = { resolve, reject };
                   
                   let bodyStr = '';
                   if (init?.body) {
                      if (typeof init.body === 'string') {
                         bodyStr = init.body;
                      } else {
                         // Serialise other types if required
                         try {
                            bodyStr = JSON.stringify(init.body);
                         } catch (e) {
                            bodyStr = String(init.body);
                         }
                      }
                   }
                   
                   if ((window as any).ReactNativeWebView) {
                      (window as any).ReactNativeWebView.postMessage(JSON.stringify({
                         type: 'API_REQUEST',
                         requestId,
                         url,
                         method: init?.method || 'GET',
                         body: bodyStr
                      }));
                   } else {
                      console.warn('[WebView Bridge] ReactNativeWebView is missing! Falling back to original fetch.');
                      originalFetch(input, init).then(resolve).catch(reject);
                   }
                });
             }
             return originalFetch(input, init);
          };

          (window as any).__handleApiResponse = (requestId: string, status: number, dataStr: string) => {
             const req = pendingRequests[requestId];
             if (req) {
                delete pendingRequests[requestId];
                let responseData = {};
                try {
                   responseData = JSON.parse(dataStr);
                } catch (e) {
                   responseData = { raw: dataStr };
                }
                
                const response = new Response(JSON.stringify(responseData), {
                   status,
                   headers: { 'Content-Type': 'application/json' }
                });
                req.resolve(response);
             }
          };

          return () => {
             window.fetch = originalFetch;
          };
       }
    }, []);

    useEffect(() => {
       const unlockAudio = () => {
          if (!unlockedAudioRef.current) {
             const audio = new Audio();
             audio.play().then(() => {
                audio.pause();
                unlockedAudioRef.current = audio;
             }).catch(() => {});
          }
          if (typeof window !== 'undefined' && window.speechSynthesis) {
             try {
                const u = new SpeechSynthesisUtterance('');
                u.volume = 0;
                window.speechSynthesis.speak(u);
             } catch (_) {}
          }
          window.removeEventListener('click', unlockAudio);
          window.removeEventListener('touchstart', unlockAudio);
       };
       window.addEventListener('click', unlockAudio);
       window.addEventListener('touchstart', unlockAudio);
       return () => {
          window.removeEventListener('click', unlockAudio);
          window.removeEventListener('touchstart', unlockAudio);
       };
    }, []);

    // Generate config QR Code
    useEffect(() => {
       if (AppConfig.apiMode === 'native-bridge') {
          console.log('[WebView Bridge] Activating local fetch interceptor...');
          const originalFetch = window.fetch;
          const pendingRequests: Record<string, { resolve: (res: Response) => void; reject: (err: Error) => void }> = {};
          (window as any).__pendingRequests = pendingRequests;
          
          window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
             const url = typeof input === 'string' ? input : (input as any).url || '';
             
             const isNativeRoute = 
                url.startsWith('/api/config') ||
                url.startsWith('/api/initialize') ||
                url.startsWith('/api/content') ||
                url.startsWith('/api/queue') ||
                url.startsWith('/api/upload') ||
                url.startsWith('/api/chat') ||
                url.startsWith('/api/git-sync') ||
                url.startsWith('/api/reindex');
             
             if (isNativeRoute) {
                return new Promise<Response>((resolve, reject) => {
                   const requestId = Math.random().toString(36).substring(7);
                   pendingRequests[requestId] = { resolve, reject };
                   
                   let bodyStr = '';
                   if (init?.body) {
                      if (typeof init.body === 'string') {
                         bodyStr = init.body;
                      } else {
                         // Serialise other types if required
                         try {
                            bodyStr = JSON.stringify(init.body);
                         } catch (e) {
                            bodyStr = String(init.body);
                         }
                      }
                   }
                   
                   if ((window as any).ReactNativeWebView) {
                      (window as any).ReactNativeWebView.postMessage(JSON.stringify({
                         type: 'API_REQUEST',
                         requestId,
                         url,
                         method: init?.method || 'GET',
                         body: bodyStr
                      }));
                   } else {
                      console.warn('[WebView Bridge] ReactNativeWebView is missing! Falling back to original fetch.');
                      originalFetch(input, init).then(resolve).catch(reject);
                   }
                });
             }
             return originalFetch(input, init);
          };

          (window as any).__handleApiResponse = (requestId: string, status: number, dataStr: string) => {
             const req = pendingRequests[requestId];
             if (req) {
                delete pendingRequests[requestId];
                let responseData = {};
                try {
                   responseData = JSON.parse(dataStr);
                } catch (e) {
                   responseData = { raw: dataStr };
                }
                
                const response = new Response(JSON.stringify(responseData), {
                   status,
                   headers: { 'Content-Type': 'application/json' }
                });
                req.resolve(response);
             }
          };

          return () => {
             window.fetch = originalFetch;
          };
       }
    }, []);

    // Generate config QR Code
    useEffect(() => {
       if (wizardStep === 5 || showExportConfig || showQrModal) {
          const configObj = {
             lang: langInput,
             name: nameInput,
             email: emailInput,
             llm: { provider: llmProvider, model: llmModel, apiKey: llmApiKey, llamaEndpoint },
             okfStorage: {
                type: okfType,
                githubToken,
                gitUrl: gitUrl
             },
             blobStorage: {
                type: blobType,
                accessKey: s3AccessKey,
                secretKey: s3SecretKey,
                region: s3Region,
                endpoint: s3Endpoint,
                bucket: s3Bucket
             },
             interests: serializeInterests(selectedInterests)
          };
          const compressed = compressConfig(configObj);
           QRCode.toDataURL(JSON.stringify(compressed), {
              errorCorrectionLevel: 'L',
              margin: 2,
              width: 400
           })
             .then(url => setQrCodeDataUrl(url))
             .catch(err => console.error('Failed to generate QR Code', err));
       }
    }, [wizardStep, showExportConfig, showQrModal, langInput, nameInput, emailInput, llmModel, llmApiKey, okfType, githubToken, repoOwner, repoName, gitUrl, repoBranch, blobType, s3AccessKey, s3SecretKey, s3Region, s3Endpoint, s3Bucket, selectedInterests]);

    const startScanner = async () => {
       if ((window as any).ReactNativeWebView) {
          (window as any).ReactNativeWebView.postMessage(JSON.stringify({
             type: 'SCAN_QR_CODE'
          }));
          return;
       }

       if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          alert("Votre navigateur ou appareil ne permet pas l'accès en direct à la caméra sur une connexion HTTP non sécurisée. Veuillez utiliser le bouton 'Importer l'image d'un QR Code' pour le prendre en photo ou le charger depuis votre galerie.");
          return;
       }
       setIsScanning(true);
       try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          if (videoRef.current) {
             videoRef.current.srcObject = stream;
             videoRef.current.setAttribute('playsinline', 'true');
             videoRef.current.play();
             // Start scanning frame loop
             setTimeout(() => {
                requestAnimationFrame(tick);
             }, 300);
          }
       } catch (err: any) {
          alert("Impossible d'accéder à la caméra : " + err.message);
          setIsScanning(false);
       }
    };

    const handleQrFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
       const file = e.target.files?.[0];
       if (!file) return;

       const reader = new FileReader();
       reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
             const maxDim = 800;
             let width = img.width;
             let height = img.height;
             if (width > maxDim || height > maxDim) {
                if (width > height) {
                   height = Math.round((height * maxDim) / width);
                   width = maxDim;
                } else {
                   width = Math.round((width * maxDim) / height);
                   height = maxDim;
                 }
             }
             const canvas = document.createElement('canvas');
             const ctx = canvas.getContext('2d');
             if (ctx) {
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                   inversionAttempts: 'attemptBoth',
                });
                if (code) {
                   try {
                      stopScanner();
                      const parsedConfig = decompressConfig(JSON.parse(code.data));
                      applyImportedConfig(parsedConfig);
                   } catch (e) {
                      console.error('Failed to parse scanned QR config', e);
                   }
                } else {
                   alert("Aucun QR Code n'a pu être détecté dans cette image. Assurez-vous que l'image est nette et bien centrée.");
                }
                     }
                  };
                  img.src = event.target?.result as string;
                };
                reader.readAsDataURL(file);
             };

             const triggerQrFilePicker = () => {
                if ((window as any).ReactNativeWebView) {
                   (window as any).ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'PICK_QR_IMAGE'
                   }));
                } else {
                   const fileInput = document.getElementById('qr-file-input');
                   if (fileInput) {
                      fileInput.click();
                   }
                }
             };

    const stopScanner = () => {
       if (videoRef.current && videoRef.current.srcObject) {
          const stream = videoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach(track => track.stop());
       }
       setIsScanning(false);
    };

    const tick = () => {
       if (!isScanning) return;
       if (!videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
          requestAnimationFrame(tick);
          return;
       }
       if (canvasRef.current && videoRef.current) {
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          if (ctx) {
             canvas.width = videoRef.current.videoWidth;
             canvas.height = videoRef.current.videoHeight;
             ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
             const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
             const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'attemptBoth',
             });
             if (code) {
                applyImportedConfig(config);
             }
          }
       }
       requestAnimationFrame(tick);
    };

    // Clean up scanner on unmount
    useEffect(() => {
       if (AppConfig.apiMode === 'native-bridge') {
          console.log('[WebView Bridge] Activating local fetch interceptor...');
          const originalFetch = window.fetch;
          const pendingRequests: Record<string, { resolve: (res: Response) => void; reject: (err: Error) => void }> = {};
          (window as any).__pendingRequests = pendingRequests;
          
          window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
             const url = typeof input === 'string' ? input : (input as any).url || '';
             
             const isNativeRoute = 
                url.startsWith('/api/config') ||
                url.startsWith('/api/initialize') ||
                url.startsWith('/api/content') ||
                url.startsWith('/api/queue') ||
                url.startsWith('/api/upload') ||
                url.startsWith('/api/chat') ||
                url.startsWith('/api/git-sync') ||
                url.startsWith('/api/reindex');
             
             if (isNativeRoute) {
                return new Promise<Response>((resolve, reject) => {
                   const requestId = Math.random().toString(36).substring(7);
                   pendingRequests[requestId] = { resolve, reject };
                   
                   let bodyStr = '';
                   if (init?.body) {
                      if (typeof init.body === 'string') {
                         bodyStr = init.body;
                      } else {
                         // Serialise other types if required
                         try {
                            bodyStr = JSON.stringify(init.body);
                         } catch (e) {
                            bodyStr = String(init.body);
                         }
                      }
                   }
                   
                   if ((window as any).ReactNativeWebView) {
                      (window as any).ReactNativeWebView.postMessage(JSON.stringify({
                         type: 'API_REQUEST',
                         requestId,
                         url,
                         method: init?.method || 'GET',
                         body: bodyStr
                      }));
                   } else {
                      console.warn('[WebView Bridge] ReactNativeWebView is missing! Falling back to original fetch.');
                      originalFetch(input, init).then(resolve).catch(reject);
                   }
                });
             }
             return originalFetch(input, init);
          };

          (window as any).__handleApiResponse = (requestId: string, status: number, dataStr: string) => {
             const req = pendingRequests[requestId];
             if (req) {
                delete pendingRequests[requestId];
                let responseData = {};
                try {
                   responseData = JSON.parse(dataStr);
                } catch (e) {
                   responseData = { raw: dataStr };
                }
                
                const response = new Response(JSON.stringify(responseData), {
                   status,
                   headers: { 'Content-Type': 'application/json' }
                });
                req.resolve(response);
             }
          };

          return () => {
             window.fetch = originalFetch;
          };
       }
    }, []);

    useEffect(() => {
       return () => {
          if (videoRef.current && videoRef.current.srcObject) {
             const stream = videoRef.current.srcObject as MediaStream;
             stream.getTracks().forEach(track => track.stop());
          }
       };
    }, []);



   const handleToggleSpeech = async (text: string, index: number) => {
      

      if ((window as any).ReactNativeWebView && userProfile.ttsProvider !== 'ElevenLabs') {
         if (speakingIndex === index) {
            (window as any).ReactNativeWebView.postMessage(JSON.stringify({
               type: 'STOP_SPEAK'
            }));
            setSpeakingIndex(null);
         } else {
            setSpeakingIndex(index);
            const cleanText = text.replace(/[#*`[\]()]/g, '');
            (window as any).ReactNativeWebView.postMessage(JSON.stringify({
               type: 'SPEAK',
               text: cleanText,
               language: userProfile.language ? userProfile.language.replace('_', '-') : 'fr-FR'
            }));
         }
         return;
      }

      if (speakingIndex === index) {
         if (userProfile.ttsProvider === 'ElevenLabs') {
            if (activeAudioRef.current) {
               activeAudioRef.current.pause();
               activeAudioRef.current = null;
            }
         } else {
            window.speechSynthesis.cancel();
         }
         setSpeakingIndex(null);
      } else {
         window.speechSynthesis.cancel();
         if (activeAudioRef.current) {
            activeAudioRef.current.pause();
            activeAudioRef.current = null;
         }

         setSpeakingIndex(index);

         try {
            if (userProfile.ttsProvider === 'ElevenLabs') {
               if (!userProfile.elevenLabsApiKey) {
                  alert("Veuillez saisir votre clé API ElevenLabs dans les paramètres du profil.");
                  setSpeakingIndex(null);
                  return;
               }

               const cleanText = text.replace(/[#*`[\]()]/g, '');
               const voiceId = userProfile.elevenLabsVoiceId || 'H17IYSiB8dvXDnAbYRT0';

               const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
                  method: 'POST',
                  headers: {
                     'Content-Type': 'application/json',
                     'xi-api-key': userProfile.elevenLabsApiKey
                  },
                  body: JSON.stringify({
                     text: cleanText,
                     model_id: 'eleven_multilingual_v2',
                     voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75
                     }
                  })
               });

               if (!response.ok) {
                  const errText = await response.text();
                  throw new Error(`ElevenLabs TTS request failed: ${response.statusText} - ${errText}`);
               }

               const blob = await response.blob();
               const url = URL.createObjectURL(blob);
               
               let audio = unlockedAudioRef.current;
               if (!audio) {
                  audio = new Audio();
                  unlockedAudioRef.current = audio;
               }
               audio.src = url;
               activeAudioRef.current = audio;

               audio.onended = () => {
                  setSpeakingIndex(null);
                  activeAudioRef.current = null;
               };
               audio.onerror = () => {
                  setSpeakingIndex(null);
                  activeAudioRef.current = null;
               };

               await audio.play();
            } else {
               const cleanText = text.replace(/[#*`[\]()]/g, '');
               const utterance = new SpeechSynthesisUtterance(cleanText);
               utterance.lang = userProfile.language ? userProfile.language.replace('_', '-') : 'fr-FR';

               utterance.onend = () => setSpeakingIndex(null);
               utterance.onerror = () => setSpeakingIndex(null);

               window.speechSynthesis.speak(utterance);
            }
         } catch (e: any) {
            console.error(e);
            alert("Erreur lors de la lecture vocale : " + e.message);
            setSpeakingIndex(null);
         }
      }
   };

   const buildRawOKF = (doc: any) => {
      const frontmatterLines = [
         '---',
         `type: ${doc.type || 'concept'}`,
         `title: ${JSON.stringify(doc.title || '')}`,
         doc.summary ? `description: ${JSON.stringify(doc.summary)}` : null,
         doc.tags && doc.tags.length > 0 ? `tags:\n${doc.tags.map((t: string) => `  - ${t}`).join('\n')}` : null,
         doc.createdAt ? `timestamp: ${doc.createdAt}` : null,
         doc.documentDate ? `documentDate: ${doc.documentDate}` : null,
         doc.category ? `category: ${doc.category}` : null,
         doc.originalFileUri ? `originalFileUri: ${doc.originalFileUri}` : null,
         doc.fileHash ? `fileHash: ${doc.fileHash}` : null,
         doc.source ? `source: ${JSON.stringify(doc.source)}` : null,
         doc.markdownFileUri ? `markdownFileUri: ${doc.markdownFileUri}` : null,
         doc.contextNote ? `contextNote: ${JSON.stringify(doc.contextNote)}` : null,
         '---'
      ].filter(Boolean);
      
      return frontmatterLines.join('\n') + '\n' + (doc.body || '');
   };


    const startRecording = async () => {
       if ((window as any).ReactNativeWebView) {
          (window as any).ReactNativeWebView.postMessage(JSON.stringify({
             type: 'TOGGLE_RECORDING',
             context: 'note'
          }));
          setRecording(true);
          setRecordingSeconds(0);
          recordingIntervalRef.current = setInterval(() => {
             setRecordingSeconds(prev => prev + 1);
          }, 1000);
          return;
       }

       try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const mediaRecorder = new MediaRecorder(stream);
          mediaRecorderRef.current = mediaRecorder;

          const chunks: BlobPart[] = [];
          mediaRecorder.ondataavailable = (e) => {
             if (e.data.size > 0) chunks.push(e.data);
          };

          mediaRecorder.onstop = () => {
             const blob = new Blob(chunks, { type: 'audio/wav' });
             setAudioBlob(blob);
             setAudioUrl(URL.createObjectURL(blob));
             stream.getTracks().forEach(track => track.stop());
          };

          setAudioBlob(null);
          setAudioUrl('');
          setRecordingSeconds(0);
          mediaRecorder.start();
          setRecording(true);

          recordingIntervalRef.current = setInterval(() => {
             setRecordingSeconds(prev => prev + 1);
          }, 1000);
       } catch (err) {
          console.error('Failed to start recording:', err);
          alert("Impossible d'accéder au microphone.");
       }
    };

    const stopRecording = () => {
       if ((window as any).ReactNativeWebView) {
          (window as any).ReactNativeWebView.postMessage(JSON.stringify({
             type: 'TOGGLE_RECORDING',
             context: 'note'
          }));
          setRecording(false);
          if (recordingIntervalRef.current) {
             clearInterval(recordingIntervalRef.current);
          }
          return;
       }

       if (mediaRecorderRef.current && recording) {
          mediaRecorderRef.current.stop();
          setRecording(false);
          if (recordingIntervalRef.current) {
             clearInterval(recordingIntervalRef.current);
          }
       }
    };

    const formatDuration = (s: number) => {
       const mins = Math.floor(s / 60);
       const secs = s % 60;
       return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

   useEffect(() => {
      const loadConfig = async () => {
         try {
            const res = await fetch('/api/config');
            if (res.ok) {
               const config = await res.json();
               if (config.name) {
                  setNameInput(config.name);
                  setEmailInput(config.email || '');
                  setLangInput(config.lang || 'fr_FR');
                  setUserProfile(prev => ({
                     ...prev,
                     name: config.name,
                     email: config.email || '',
                     language: config.lang || 'fr_FR'
                  }));
                  if (config.llm) {
                     setLlmModel(config.llm.model || 'gemini-2.5-flash');
                     setLlmApiKey(config.llm.apiKey || '');
                  }
                  if (config.okfStorage) {
                             if (config.okfStorage.type) setOkfType(config.okfStorage.type);
                             if (config.okfStorage.githubToken) setGithubToken(config.okfStorage.githubToken);
                             if (config.okfStorage.gitUrl) {
                                setGitUrl(config.okfStorage.gitUrl);
                                const parsed = parseGitUrl(config.okfStorage.gitUrl);
                                if (parsed) {
                                   setRepoOwner(parsed['owner']);
                                   setRepoName(parsed['repo']);
                                }
                             } else {
                                if (config.okfStorage.repoOwner) setRepoOwner(config.okfStorage.repoOwner);
                                if (config.okfStorage.repoName) setRepoName(config.okfStorage.repoName);
                             }
                             setRepoBranch(config.okfStorage.branch || 'main');
                         }
                  if (config.blobStorage) {
                     setBlobType(config.blobStorage.type || 'local');
                     setS3AccessKey(config.blobStorage.accessKey || '');
                     setS3SecretKey(config.blobStorage.secretKey || '');
                     setS3Region(config.blobStorage.region || 'us-east-1');
                     setS3Endpoint(config.blobStorage.endpoint || '');
                     setS3Bucket(config.blobStorage.bucket || 'second-brain');
                  }
                              setConfigured(true);
                              localStorage.setItem('sb_app_configured', 'true');
                           } else {
                              setConfigured(false);
                              localStorage.setItem('sb_app_configured', 'false');
                           }
                        } else {
                           const localConfigured = localStorage.getItem('sb_app_configured') === 'true';
                           setConfigured(localConfigured);
                        }
                     } catch (e) {
                        console.error('Failed to load backend config', e);
                        const localConfigured = localStorage.getItem('sb_app_configured') === 'true';
                        setConfigured(localConfigured);
                     }
                  };

      loadConfig();
      fetchDocuments();
      fetchOnboardingOptions();
      fetchQueue();
   }, []);

   useEffect(() => {
      const hasActiveTasks = queueTasks.some(t => t.status === 'pending' || t.status === 'processing');
      if (hasActiveTasks) {
         const timer = setInterval(() => {
            fetchQueue();
            fetchDocuments();
         }, 2000);
         return () => clearInterval(timer);
      }
   }, [queueTasks]);

   const fetchQueue = async () => {
      try {
         const res = await fetch('/api/queue');
         if (res.ok) {
            const data = await res.json();
            setQueueTasks(data.tasks || []);
         }
      } catch (err) {
         console.error('Failed to fetch queue', err);
      }
   };

   const handleDeleteQueueTask = async (taskId: string) => {
      try {
         await fetch(`/api/queue?taskId=${encodeURIComponent(taskId)}`, {
            method: 'DELETE'
         });
         fetchQueue();
      } catch (err) {
         console.error('Failed to delete queue task', err);
      }
   };

   const handleRetryQueueTask = async (taskId: string) => {
      try {
         await fetch('/api/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId })
         });
         fetchQueue();
      } catch (err) {
         console.error('Failed to retry queue task', err);
      }
   };

   const handleClearAllQueueTasks = async () => {
      try {
         for (const task of queueTasks) {
            await fetch(`/api/queue?taskId=${encodeURIComponent(task.id)}`, {
               method: 'DELETE'
            });
         }
         fetchQueue();
      } catch (err) {
         console.error('Failed to clear queue tasks', err);
      }
   };

   const handleRetryAllFailedQueueTasks = async () => {
      const failedTasks = queueTasks.filter(t => t.status === 'failed');
      if (failedTasks.length === 0) return;
      for (const t of failedTasks) {
         await handleRetryQueueTask(t.id);
      }
      setNotification({
         message: `${failedTasks.length} tâche(s) en échec ont été relancée(s).`,
         type: 'success'
      });
   };

   useEffect(() => {
      if (activeTab === 'chat') {
         chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
   }, [messages, activeTab]);

   const fetchDocuments = async () => {
      try {
         const res = await fetch('/api/content');
         if (res.ok) {
            const data = await res.json();
            const items = (data.items || []).map((item: any) => ({
               ...item,
               id: item.uid || item.id
            }));
            console.log(`[Dashboard] Fetched ${items.length} documents`);
            setDocuments(items);
         }
      } catch (err) {
         console.error('Failed to fetch documents', err);
      } finally {
         setLoading(false);
      }
   };

   const fetchOnboardingOptions = async () => {
      try {
         const res = await fetch('/api/initialize');
         if (res.ok) {
            const data = await res.json();
            setOnboardingOptions(data.options || []);
         }
      } catch (err) {
         console.error('Failed to fetch onboarding options', err);
      }
   };

   const handleUnifiedImport = async (e: React.FormEvent) => {
      e.preventDefault();
      
      if (importType === 'url') {
         if (!urlInput.trim()) return;
         setAddingUrl(true);
         setUploadSuccess(false);
         try {
            const res = await fetch('/api/url', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ 
                  url: urlInput.trim(), 
                  category: categoryFilter === 'all' ? 'inbox' : categoryFilter,
                  contextNote: contextNoteInput.trim(),
                  crawlDepth
               })
            });

            if (res.ok) {
               setUrlInput('');
               setContextNoteInput('');
               setUploadSuccess(true);
               setShowUploadModal(false);
               fetchQueue();
               setMessages(prev => [
                  ...prev,
                  { role: 'assistant', content: `Importation de l'URL lancée en arrière-plan.` }
               ]);
               setTimeout(() => setUploadSuccess(false), 2000);
            } else {
               const err = await res.json();
               alert(err.error || "Erreur lors de l'ajout de l'URL");
            }
         } catch (err) {
            console.error('Failed to ingest URL', err);
            alert("Impossible de contacter le serveur d'ingestion");
         } finally {
            setAddingUrl(false);
         }
      } else if (importType === 'text') {
         if (!markdownInput.trim()) return;
         setUploading(true);
         setUploadSuccess(false);

         const formData = new FormData();
         formData.append('textContent', markdownInput.trim());
         formData.append('category', categoryFilter === 'all' ? 'inbox' : categoryFilter);
         formData.append('contextNote', contextNoteInput.trim());

         try {
            const res = await fetch('/api/upload', {
               method: 'POST',
               body: formData
            });
            if (res.ok) {
               setMarkdownInput('');
               setContextNoteInput('');
               setUploadSuccess(true);
               setShowUploadModal(false);
               fetchQueue();
               setMessages(prev => [
                  ...prev,
                  { role: 'assistant', content: `Traitement du texte collé lancé en arrière-plan.` }
               ]);
               setTimeout(() => setUploadSuccess(false), 3000);
            } else {
               const errData = await res.json();
               alert(`Erreur d'importation du texte: ${errData.error}`);
            }
         } catch (err) {
            alert('Erreur réseau lors de l\'importation');
         } finally {
            setUploading(false);
         }
      } else if (importType === 'audio') {
         if (!audioBlob && selectedFiles.length === 0) return;
         setUploading(true);
         setUploadSuccess(false);

         const formData = new FormData();
         if (audioBlob) {
            formData.append('file', audioBlob, `vocal-${Date.now()}.wav`);
            formData.append('recordedLive', 'true');
         } else {
            formData.append('file', selectedFiles[0]);
         }
         formData.append('category', categoryFilter === 'all' ? 'inbox' : categoryFilter);
         formData.append('contextNote', contextNoteInput.trim());

         try {
            const res = await fetch('/api/upload', {
               method: 'POST',
               body: formData
            });
            if (res.ok) {
               setAudioBlob(null);
               setAudioUrl('');
               setSelectedFiles([]);
               setContextNoteInput('');
               setUploadSuccess(true);
               setShowUploadModal(false);
               fetchQueue();
               setMessages(prev => [
                  ...prev,
                  { role: 'assistant', content: `Traitement de la note vocale lancé en arrière-plan.` }
               ]);
               setTimeout(() => setUploadSuccess(false), 3000);
            } else {
               const errData = await res.json();
               alert(`Erreur d'importation de l'audio: ${errData.error}`);
            }
         } catch (err) {
            alert('Erreur réseau lors de l\'importation');
         } finally {
            setUploading(false);
         }
      } else {
         if (selectedFiles.length === 0) return;
         setUploading(true);
         setUploadSuccess(false);
 
         const formData = new FormData();
         for (const file of selectedFiles) {
            formData.append('file', file);
         }
         formData.append('category', categoryFilter === 'all' ? 'inbox' : categoryFilter);
         formData.append('contextNote', contextNoteInput.trim());
 
         try {
            const res = await fetch('/api/upload', {
               method: 'POST',
               body: formData
            });
            if (res.ok) {
               setSelectedFiles([]);
               setContextNoteInput('');
               setUploadSuccess(true);
               setShowUploadModal(false);
               fetchQueue();
               const filesLabel = selectedFiles.map(f => `"${f.name}"`).join(', ');
               setMessages(prev => [
                  ...prev,
                  { role: 'assistant', content: `Traitement des fichiers (${filesLabel}) lancé en arrière-plan.` }
               ]);
               setTimeout(() => setUploadSuccess(false), 3000);
            } else {
               const errData = await res.json();
               alert(`Erreur d'upload: ${errData.error}`);
            }
         } catch (err) {
            alert('Erreur réseau lors de l\'upload');
         } finally {
            setUploading(false);
         }
      }
   };

   const handleSubmitWizard = async () => {
      setInitializing(true);
      try {
         const configObj = {
            lang: langInput,
            name: nameInput,
            email: emailInput,
            llm: { provider: llmProvider, model: llmModel, apiKey: llmApiKey, llamaEndpoint },
            okfStorage: {
               type: okfType,
               githubToken,
               repoOwner: parseGitUrl(gitUrl)?.owner || repoOwner,
               repoName: parseGitUrl(gitUrl)?.repo || repoName,
               gitUrl: gitUrl,
               branch: repoBranch
            },
            blobStorage: {
               type: blobType,
               accessKey: s3AccessKey,
               secretKey: s3SecretKey,
               region: s3Region,
               endpoint: s3Endpoint,
               bucket: s3Bucket
            }
         };

         const configRes = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(configObj)
         });

         if (!configRes.ok) {
            const err = await configRes.json();
            alert(`Erreur d'enregistrement de la configuration: ${err.error}`);
            setInitializing(false);
            return;
         }

         let initOk = true;
         if (selectedInterests.length > 0) {
            const initRes = await fetch('/api/initialize', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ categories: selectedInterests })
            });
            if (!initRes.ok) {
               initOk = false;
               const err = await initRes.json();
               alert(`Erreur d'initialisation des dossiers: ${err.error}`);
            }
         }

         if (initOk) {
            const newProfile = {
               name: nameInput,
               email: emailInput,
               language: langInput,
               ttsProvider: userProfile.ttsProvider || 'Browser',
               elevenLabsApiKey: userProfile.elevenLabsApiKey || defaultElevenLabsApiKey,
               elevenLabsVoiceId: userProfile.elevenLabsVoiceId || defaultElevenLabsVoiceId
            };
            setUserProfile(newProfile);
            localStorage.setItem('sb_user_profile', JSON.stringify(newProfile));
            localStorage.setItem('sb_app_configured', 'true');
            setConfigured(true);

            fetchDocuments();
         }
      } catch (err) {
         console.error('Wizard submission failed', err);
         alert('Erreur réseau lors de la configuration.');
      } finally {
         setInitializing(false);
      }
   };

   const saveConversationAsMarkdown = async (msgs: Message[]) => {
      const validMsgs = msgs.filter(m => m.content && m.content.trim() !== '');
      if (validMsgs.length < 2) return;

      let lastDevStats: any = null;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalResponseTimeMs = 0;
      let turnsWithStats = 0;

      validMsgs.forEach(m => {
         if (m.devStats) {
            lastDevStats = m.devStats;
            totalInputTokens += m.devStats.inputTokensEstimate || 0;
            totalOutputTokens += m.devStats.outputTokensEstimate || 0;
            totalResponseTimeMs += m.devStats.responseTimeMs || 0;
            turnsWithStats++;
         }
      });

      const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const title = `Conversation du ${dateStr}`;
      
      let markdown = `# ${title}\n\n`;
      markdown += `## Statistiques de la conversation\n`;
      markdown += `- **Messages** : ${validMsgs.length}\n`;
      if (turnsWithStats > 0) {
         markdown += `- **Temps de réponse moyen** : ${Math.round(totalResponseTimeMs / turnsWithStats)} ms\n`;
         markdown += `- **Jetons consommés (Est.)** : ${totalInputTokens} entrée / ${totalOutputTokens} sortie (${totalInputTokens + totalOutputTokens} total)\n`;
         if (lastDevStats) {
            markdown += `- **Documents explorés** : ${lastDevStats.fullDocsCount || 0} pertinents / ${lastDevStats.metadataDocsCount || 0} indexés\n`;
         }
      }
      markdown += `\n---\n\n## Échanges\n\n`;

      validMsgs.forEach(m => {
         const speaker = m.role === 'user' ? '👤 Utilisateur' : '🧠 Assistant (Modaka)';
         markdown += `### ${speaker}\n${m.content}\n\n`;
      });

      const formData = new FormData();
      formData.append('textContent', markdown);
      formData.append('category', 'conversations');
      formData.append('contextNote', `Conversation auto-enregistrée - ${validMsgs.length} messages`);
      formData.append('source', 'Chat Modaka');

      try {
         await fetch('/api/upload', {
            method: 'POST',
            body: formData
         });
         fetchDocuments();
      } catch (e) {
         console.error('Failed to save conversation markdown', e);
      }
   };

   const handleSendMessage = async (e?: React.FormEvent, overrideText?: string) => {
      if (e) e.preventDefault();
      const userText = (overrideText !== undefined ? overrideText : inputMessage).trim();
      if (!userText || sending) return;

      shouldSpeakNextRef.current = !!overrideText;
      setInputMessage('');
      setMessages(prev => [...prev, { role: 'user', content: userText }]);
      setSending(true);

      try {
         const updatedMessages = [...messages, { role: 'user', content: userText }];
         const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
               messages: updatedMessages,
               userProfile
            })
         });

         if (res.ok && res.body) {
            setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
            
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedText = '';
            let buffer = '';

            while (true) {
               const { done, value } = await reader.read();
               if (done) break;

               buffer += decoder.decode(value, { stream: true });
               const lines = buffer.split('\n\n');
               buffer = lines.pop() || '';

               for (const line of lines) {
                  if (line.startsWith('data: ')) {
                     const jsonStr = line.substring(6).trim();
                     if (!jsonStr) continue;

                     try {
                        const parsed = JSON.parse(jsonStr);
                        if (parsed.error) {
                           setMessages(prev => {
                              const next = [...prev];
                              next[next.length - 1] = {
                                 role: 'assistant',
                                 content: 'Erreur de génération : ' + parsed.error
                              };
                              return next;
                           });
                        } else if (parsed.done) {
                           setMessages(prev => {
                              const next = [...prev];
                              next[next.length - 1] = {
                                 role: 'assistant',
                                 content: accumulatedText,
                                 devStats: parsed.devStats
                              };
                              setTimeout(() => {
                                 saveConversationAsMarkdown(next);
                              }, 500);
                              return next;
                           });
                           if (shouldSpeakNextRef.current) {
                              handleToggleSpeech(accumulatedText, messages.length + 1);
                              shouldSpeakNextRef.current = false;
                           }
                        } else if (parsed.text) {
                           accumulatedText += parsed.text;
                           setMessages(prev => {
                              const next = [...prev];
                              next[next.length - 1] = {
                                 role: 'assistant',
                                 content: accumulatedText
                              };
                              return next;
                           });
                        }
                     } catch (e) {
                        console.error('Failed to parse SSE JSON chunk', e);
                     }
                  }
               }
            }
         } else {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Désolé, une erreur est survenue lors de la communication avec mon processeur Gemini.' }]);
         }
      } catch (err) {
         setMessages(prev => [...prev, { role: 'assistant', content: 'Erreur de connexion. Impossible de contacter le serveur.' }]);
} finally {
         setSending(false);
      }
   };

   useEffect(() => {
      return () => {
         window.speechSynthesis.cancel();
         if (activeAudioRef.current) {
            activeAudioRef.current.pause();
         }
         if (recognitionRef.current) {
            recognitionRef.current.stop();
         }
         if (mediaRecorderChatRef.current && mediaRecorderChatRef.current.state !== 'inactive') {
            mediaRecorderChatRef.current.stop();
         }
      };
   }, []);

   useEffect(() => {
      (window as any).handleNativeMessage = (data: any) => {
         if (data.type === 'RECORDING_STATE') {
            setIsDictating(data.isRecording);
            setRecording(data.isRecording);
            if (!data.isRecording) {
               if (recordingIntervalRef.current) {
                  clearInterval(recordingIntervalRef.current);
               }
            }
         } else if (data.type === 'NATIVE_TASK_QUEUED') {
            setShowUploadModal(false);
            fetchQueue();
            alert('Note vocale enregistrée avec succès et ajoutée à la file d\'attente de traitement local.');
         } else if (data.type === 'TRANSCRIPTION_RESULT') {
            if (data.text) {
               handleSendMessage(undefined, data.text);
            }
         } else if (data.type === 'QR_PHOTO_TAKEN') {
            console.log('[Native Scanner] Received QR Code image from native app, decoding...');
            const img = new Image();
            img.onload = () => {
               const canvas = document.createElement('canvas');
               const ctx = canvas.getContext('2d');
               if (ctx) {
                  const maxDim = 800;
                   let width = img.width;
                   let height = img.height;
                   if (width > maxDim || height > maxDim) {
                      if (width > height) {
                         height = Math.round((height * maxDim) / width);
                         width = maxDim;
                      } else {
                         width = Math.round((width * maxDim) / height);
                         height = maxDim;
                      }
                   }
canvas.width = width;
                   canvas.height = height;
                   ctx.drawImage(img, 0, 0, width, height);
                  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                  const code = jsQR(imageData.data, imageData.width, imageData.height, {
                     inversionAttempts: 'attemptBoth',
                  });
                  if (code) {
                     try {
                        const parsedConfig = decompressConfig(JSON.parse(code.data));
                        applyImportedConfig(parsedConfig);
                     } catch (e) {
                        console.error('Failed to parse camera QR code config', e);
                     }
                  } else {
                     alert("Aucun QR Code n'a pu être détecté sur la photo. Assurez-vous d'être stable, bien éclairé et de cadrer le QR Code de près.");
                  }
               }
            };
            img.src = data.base64;
         } else if (data.type === 'SCAN_QR_ERROR') {
            alert(`Erreur caméra native : ${data.error}`);
         } else if (data.type === 'RECORDING_ERROR') {
            alert(`Erreur d'enregistrement : ${data.error}`);
            setIsDictating(false);
            setRecording(false);
         } else if (data.type === 'SPEECH_DONE' || data.type === 'SPEECH_ERROR') {
            setSpeakingIndex(null);
         } else if (data.type === 'NATIVE_LOG') {
            console.log('[Native Log from App.tsx]', data.message);
         }
      };
      return () => {
         delete (window as any).handleNativeMessage;
      };
   }, [messages, sending, userProfile]);

    const handleDictation = () => {
       if ((window as any).ReactNativeWebView) {
          (window as any).ReactNativeWebView.postMessage(JSON.stringify({
             type: 'TOGGLE_RECORDING'
          }));
          return;
       }

       const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
       if (SpeechRecognition) {
          if (isDictating) {
             if (recognitionRef.current) {
                recognitionRef.current.stop();
             }
             setIsDictating(false);
          } else {
             const recognition = new SpeechRecognition();
             recognitionRef.current = recognition;
             recognition.continuous = false;
             recognition.interimResults = false;
             
             
             recognition.lang = userProfile.language ? userProfile.language.replace('_', '-') : 'fr-FR';

             recognition.onstart = () => {
                setIsDictating(true);
             };

             recognition.onresult = (event: any) => {
                const transcript = event.results[0][0].transcript;
                if (transcript) {
                   handleSendMessage(undefined, transcript);
                }
             };

             recognition.onerror = (event: any) => {
                console.error('Speech recognition error:', event.error);
                setIsDictating(false);
             };

             recognition.onend = () => {
                setIsDictating(false);
             };

             recognition.start();
          }
       } else {
          // Fallback: use MediaRecorder!
          if (isDictating) {
             if (mediaRecorderChatRef.current && mediaRecorderChatRef.current.state !== 'inactive') {
                mediaRecorderChatRef.current.stop();
             }
             setIsDictating(false);
          } else {
             startAudioRecordingFallback();
          }
       }
    };

    const startAudioRecordingFallback = async () => {
       try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const mediaRecorder = new MediaRecorder(stream);
          mediaRecorderChatRef.current = mediaRecorder;
          audioChunksChatRef.current = [];

          mediaRecorder.ondataavailable = (e) => {
             if (e.data.size > 0) {
                audioChunksChatRef.current.push(e.data);
             }
          };

          mediaRecorder.onstop = async () => {
             const blob = new Blob(audioChunksChatRef.current, { type: 'audio/wav' });
             stream.getTracks().forEach(track => track.stop());

             // Now upload and transcribe the audio
             try {
                const formData = new FormData();
                formData.append('file', blob, 'dictation.wav');

                const response = await fetch('/api/transcribe', {
                   method: 'POST',
                   body: formData
                });

                if (response.ok) {
                   const data = await response.json();
                    if (data.text) {
                       handleSendMessage(undefined, data.text);
                    }
                } else {
                   console.error('Failed to transcribe audio via fallback');
                }
             } catch (err) {
                console.error('Error uploading dictation audio:', err);
             }
          };

          mediaRecorder.start();
          setIsDictating(true);
       } catch (err) {
          console.error('Failed to start fallback audio recording:', err);
          alert("La reconnaissance vocale n'est pas supportée par votre appareil, et l'accès au microphone a échoué.");
       }
    };

   const handleUpdateCategory = async (doc: ContentItemData, newCat: string) => {
      try {
         const res = await fetch(`/api/content/${doc.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...doc, category: newCat })
         });
         if (res.ok) {
            setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, category: newCat } : d));
            if (selectedDoc && selectedDoc.id === doc.id) {
               setSelectedDoc({ ...selectedDoc, category: newCat });
            }
         }
      } catch (err) {
         console.error('Failed to update category', err);
      }
   };

    const executeDeleteDoc = async (id: string) => {
       try {
          const res = await fetch(`/api/content/${id}`, {
             method: 'DELETE'
          });
          if (res.ok) {
             setDocuments(prev => prev.filter(d => d.id !== id));
             if (selectedDoc && selectedDoc.id === id) {
                setSelectedDoc(null);
             }
          }
       } catch (err) {
          console.error('Failed to delete document', err);
       }
    };

   const handleVerifyOrCreateRepo = async () => {
      if (!githubToken) {
         alert("Veuillez d'abord vous connecter à GitHub ou renseigner votre token d'accès.");
         return;
      }
      
      const owner = parseGitUrl(gitUrl)?.owner || repoOwner;
      const repo = parseGitUrl(gitUrl)?.repo || repoName;

      if (!owner || !repo) {
         alert("Veuillez renseigner le propriétaire et le nom du dépôt.");
         return;
      }

      setRepoStatus('checking');
      setRepoErrorMsg('');

      try {
         const checkRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
            headers: {
               'Authorization': `Bearer ${githubToken}`,
               'Accept': 'application/json'
            }
         });

         if (checkRes.status === 200) {
            setRepoStatus('found');
            setGitUrl(`https://github.com/${owner}/${repo}.git`);
            alert("Dépôt GitHub validé avec succès !");
            return;
         }

         if (checkRes.status === 404) {
            setRepoStatus('not_found');
            if (confirm(`Le dépôt "${owner}/${repo}" n'existe pas ou n'est pas accessible. Souhaitez-vous que nous le créions pour vous en mode privé ?`)) {
               setRepoStatus('creating');
               const createRes = await fetch('https://api.github.com/user/repos', {
                  method: 'POST',
                  headers: {
                     'Authorization': `Bearer ${githubToken}`,
                     'Content-Type': 'application/json',
                     'Accept': 'application/json'
                  },
                  body: JSON.stringify({
                     name: repo,
                     private: true,
                     description: 'Dépôt de connaissances créé automatiquement par Modaka',
                     auto_init: true
                  })
               });

               if (createRes.ok) {
                  setRepoStatus('created');
                  setGitUrl(`https://github.com/${owner}/${repo}.git`);
                  alert(`Dépôt "${owner}/${repo}" créé avec succès !`);
               } else {
                  const errData = await createRes.json();
                  throw new Error(errData.message || 'Impossible de créer le dépôt.');
               }
            } else {
               setRepoStatus('idle');
            }
            return;
         }

         const errData = await checkRes.json().catch(() => ({}));
         throw new Error(errData.message || `Erreur d'accès au dépôt (Code ${checkRes.status}).`);
      } catch (err: any) {
         console.error('Git repository verification failed:', err);
         setRepoStatus('error');
         setRepoErrorMsg(err.message || 'Une erreur est survenue.');
         alert(`Erreur de vérification: ${err.message || 'Une erreur est survenue.'}`);
      }
   };

   const handleReindex = async () => {
      setReindexing(true);
      try {
         const res = await fetch('/api/reindex', {
            method: 'POST'
         });
         if (res.ok) {
            alert('Réindexation des dossiers terminée avec succès !');
            fetchDocuments();
         } else {
            const err = await res.json();
            alert(`Erreur de réindexation: ${err.error || 'Erreur inconnue'}`);
         }
      } catch (err) {
         console.error('Failed to reindex directories', err);
         alert('Erreur réseau lors de la réindexation');
      } finally {
         setReindexing(false);
      }
   };

   const handleGitSync = async () => {
      setSyncingGit(true);
      try {
         if ((window as any).ReactNativeWebView) {
            if (!githubToken || !repoOwner || !repoName) {
               alert('Configuration GitHub incomplète (Token, Propriétaire, ou Dépôt manquant).');
               setSyncingGit(false);
               return;
            }

            // Dynamically import GithubHttpClient from our new @quatrain/git-client package
            const { GithubHttpClient } = await import('@quatrain/git-client');
            const client = new GithubHttpClient({
               token: githubToken,
               owner: repoOwner,
               repo: repoName,
               branch: repoBranch
            });

            console.log('[Git Sync Client] Fetching file tree from GitHub...');
            const tree = await client.fetchFileTree();
            const noteBlobs = tree.filter((b: any) => 
               b.type === 'blob' && 
               b.path.startsWith('content/') && 
               b.path.endsWith('.md') && 
               !b.path.endsWith('index.md')
            );

            console.log(`[Git Sync Client] Found ${noteBlobs.length} notes. Downloading and importing...`);

            let successCount = 0;
            for (const blob of noteBlobs) {
               try {
                  const rawContent = await client.downloadBlob(blob.sha);
                  const { metadata, body } = client.parseFrontmatter(rawContent);

                  const parts = blob.path.split('/');
                  const filename = parts[parts.length - 1];
                  const id = filename.substring(0, filename.lastIndexOf('.')) || filename;

                  const catParts = parts.slice(1, parts.length - 1);
                  const category = catParts.join('/') || 'inbox';

                  const cleanTitle = metadata.title || id;
                  const docType = metadata.type || 'document';
                  const tags = metadata.tags || [];
                  const summary = metadata.summary || '';
                  const createdAt = metadata.timestamp || new Date().toISOString();

                  // Post note to the phone's native local database storage
                  const postRes = await fetch(`/api/content`, {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({
                        id,
                        title: cleanTitle,
                        type: docType,
                        category,
                        tags,
                        summary,
                        originalFileUri: `github://${repoOwner}/${repoName}/${blob.path}`,
                        body: body,
                        createdAt
                     })
                  });

                  if (postRes.ok) {
                     successCount++;
                  }
               } catch (blobErr) {
                  console.error(`Failed to sync blob ${blob.path}`, blobErr);
               }
            }

            alert(`Synchronisation terminée avec succès : ${successCount}/${noteBlobs.length} fiches importées sur le téléphone !`);
            fetchDocuments();
         } else {
            const res = await fetch('/api/git-sync', {
               method: 'POST'
            });
            const data = await res.json();
            if (res.ok && data.success) {
               alert('Synchronisation Git terminée avec succès (Pull & Push effectués) !');
               fetchDocuments();
            } else {
               alert(`Erreur de synchronisation Git : ${data.message || 'Erreur inconnue'}`);
            }
         }
      } catch (err: any) {
         console.error('Failed to trigger Git sync', err);
         alert(`Erreur lors de la synchronisation Git : ${err.message || err}`);
      } finally {
         setSyncingGit(false);
      }
   };


   const getCategoryCardClass = (cat?: string) => {
      switch (cat) {
         case 'work': return 'card-teal';
         case 'personal': return 'card-green';
         case 'urgent': return 'card-orange';
         default: return 'card-grey';
      }
   };

   const conversationDocs = documents.filter(doc => 
      doc.category === 'conversations' || 
      doc.type === 'conversation' || 
      doc.tags?.includes('conversation')
   );

   const filteredDocs = documents.filter(doc => {
      if (doc.category === 'conversations' || doc.type === 'conversation' || doc.tags?.includes('conversation')) {
         return false;
      }

      const matchesCategory = categoryFilter === 'all' || 
         doc.category === categoryFilter ||
         (doc.category && doc.category.startsWith(categoryFilter + '/'));
      
      if (!matchesCategory) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
         doc.title?.toLowerCase().includes(q) ||
         doc.summary?.toLowerCase().includes(q) ||
         doc.body?.toLowerCase().includes(q) ||
         doc.tags?.some(tag => tag.toLowerCase().includes(q))
      );
   });

    const resetRecording = () => {};

    return (
       <div className="app-container">
          <style dangerouslySetInnerHTML={{ __html: AppConfig.getCssVariablesString() }} />

          {notification && (
             <div 
                style={{
                   position: 'fixed',
                   top: '20px',
                   right: '20px',
                   zIndex: 3000,
                   padding: '12px 20px',
                   borderRadius: '14px',
                   backgroundColor: notification.type === 'error' ? 'rgba(239, 68, 68, 0.95)' : notification.type === 'success' ? 'rgba(16, 185, 129, 0.95)' : 'rgba(59, 130, 246, 0.95)',
                   color: '#fff',
                   fontSize: '14px',
                   fontWeight: '600',
                   boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
                   backdropFilter: 'blur(8px)',
                   display: 'flex',
                   alignItems: 'center',
                   gap: '10px',
                   maxWidth: '400px',
                   cursor: 'pointer'
                }}
                onClick={() => setNotification(null)}
             >
                <span>{notification.message}</span>
             </div>
          )}

          {loading ? (
             <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                minHeight: '400px',
                flexDirection: 'column',
                gap: '16px',
                color: 'white'
             }}>
                <IconLoader2 style={{ animation: 'spin 1.5s linear infinite', color: 'var(--color-vivid-green)' }} size={40} />
                <span style={{ fontSize: '15px', color: 'rgba(255,255,255,0.6)', fontWeight: '500' }}>Chargement de {AppConfig.name}...</span>
             </div>
          ) : (
             <>
          {/* Top Header */}
          <header style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <img src={AppConfig.logoUrl} alt={AppConfig.name} style={{ width: '42px', height: '42px', objectFit: 'contain' }} />
                <h1 style={{ fontSize: '24px', letterSpacing: '-0.5px' }}>{AppConfig.name}</h1>
             </div>
             <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>

                 <button
                     onClick={() => {
                        setQrModalZoomed(false);
                        setShowQrModal(true);
                     }}
                     style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '10px',
                        width: '38px',
                        height: '38px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        marginRight: '8px'
                     }}
                     title="Afficher le QR Code de configuration"
                  >
                     <IconQrcode size={18} />
                  </button>

                  <button
                      onClick={() => setShowLlmModal(true)}
                      style={{
                         background: 'rgba(59, 130, 246, 0.12)',
                         border: '1px solid rgba(59, 130, 246, 0.3)',
                         borderRadius: '10px',
                         height: '38px',
                         padding: '0 12px',
                         display: 'flex',
                         alignItems: 'center',
                         gap: '6px',
                         color: '#60a5fa',
                         fontSize: '13px',
                         fontWeight: '600',
                         cursor: 'pointer',
                         transition: 'all 0.2s ease'
                      }}
                      title="Configurer le Moteur IA / LLM (Gemini, Llama...)"
                   >
                      <IconSparkles size={18} />
                      <span>Moteur LLM</span>
                   </button>

                  <button
                     onClick={() => setShowSkillsModal(true)}
                     style={{
                        background: 'rgba(56, 189, 248, 0.1)',
                        border: '1px solid rgba(56, 189, 248, 0.3)',
                        borderRadius: '10px',
                        height: '38px',
                        padding: '0 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: '#38bdf8',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: '600',
                        transition: 'all 0.2s ease'
                     }}
                     title="Skills & Connexion aux services tiers (Jellyfin, Wikipédia...)"
                  >
                     <IconPuzzle size={18} />
                     <span>Skills</span>
                  </button>

                 <button
                     onClick={() => setShowProfileModal(true)}
                     style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '10px',
                        width: '38px',
                        height: '38px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                     }}
                     title="Profil utilisateur & Langue"
                  >
                     <IconUser size={18} />
                  </button>

                 {documents.length > 0 && (
                    <div>
                       {uploading || addingUrl ? (
                          <IconLoader2 className="status-badge" style={{ animation: 'spin 1.5s linear infinite', color: 'var(--color-vivid-yellow)' }} />
                       ) : uploadSuccess ? (
                          <IconCircleCheck style={{ color: 'var(--color-vivid-green)' }} />
                       ) : null}
                    </div>
                 )}
              </div>
          </header>

          {!configured ? (
             <main style={{ flex: 1, padding: '40px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', maxWidth: '600px', margin: '0 auto', gap: '24px', width: '100%' }}>
                {isScanning && (
                   <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'black', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <h3 style={{ color: 'white', marginBottom: '16px' }}>Alignez le QR Code dans le cadre</h3>
                      <div style={{ position: 'relative', width: '280px', height: '280px', border: '3px solid var(--color-vivid-green)', borderRadius: '16px', overflow: 'hidden' }}>
                         <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <canvas ref={canvasRef} style={{ display: 'none' }} />
                      <button 
                         onClick={stopScanner}
                         className="action-button btn-secondary"
                         style={{ marginTop: '24px', width: '200px', height: '48px', fontSize: '15px', cursor: 'pointer' }}
                      >
                         Annuler
                         </button>

                         {devMode && (
                            <div 
                               style={{ 
                                  marginTop: '24px', 
                                  padding: '16px', 
                                  borderRadius: '16px', 
                                  backgroundColor: 'rgba(239, 68, 68, 0.05)', 
                                  border: '1px solid rgba(239, 68, 68, 0.2)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '12px'
                               }}
                            >
                               <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  🛠️ Outils de Test & Debug (Mode Développeur)
                               </h4>
                               <p style={{ margin: 0, fontSize: '11px', color: 'rgba(255,255,255,0.5)', lineHeight: '1.4' }}>
                                  Ces boutons vous permettent de forcer la synchronisation ou de valider le fonctionnement de vos services.
                               </p>

                               <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                                  <button
                                     onClick={handleGitSync}
                                     disabled={syncingGit}
                                     className="action-button"
                                     style={{ 
                                        flex: 1, 
                                        minWidth: '150px', 
                                        height: '42px', 
                                        fontSize: '12px', 
                                        backgroundColor: '#ef4444', 
                                        color: 'white', 
                                        fontWeight: '600',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        cursor: 'pointer'
                                     }}
                                  >
                                     {syncingGit ? (
                                        <IconLoader2 style={{ animation: 'spin 1s linear infinite' }} size={16} />
                                     ) : (
                                        <>🔄 Forcer Synchro Git (Pull & Push)</>
                                     )}
                                  </button>

                                  <button
                                     onClick={handleReindex}
                                     disabled={reindexing}
                                     className="action-button btn-secondary"
                                     style={{ 
                                        flex: 1, 
                                        minWidth: '150px', 
                                        height: '42px', 
                                        fontSize: '12px', 
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        cursor: 'pointer'
                                     }}
                                  >
                                     {reindexing ? (
                                        <IconLoader2 style={{ animation: 'spin 1s linear infinite' }} size={16} />
                                     ) : (
                                        <>📂 Forcer Réindexation (index.md)</>
                                     )}
                                  </button>
                               </div>
                            </div>
                         )}
                      </div>
                )}

                {/* Header */}
                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                   <img src={AppConfig.logoUrl} alt={AppConfig.name} style={{ width: '80px', height: '80px', objectFit: 'contain', margin: '0 auto' }} />
                   <h2 style={{ fontSize: '24px', color: 'var(--color-vivid-green)', letterSpacing: '-0.5px', marginTop: '8px', margin: 0 }}>Bienvenue dans {AppConfig.name}</h2>
                   <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', margin: 0 }}>
                      Votre second cerveau numérique local-first. Initialisez votre espace en un clic.
                   </p>
                </div>

                <div style={{ width: '100%', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '20px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                   {/* Quick Profile Inputs */}
                   <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '600', color: 'rgba(255,255,255,0.9)' }}>Prénom / Nom</label>
                      <input 
                         type="text" 
                         placeholder="ex: Mon Modaka" 
                         value={nameInput} 
                         onChange={(e) => setNameInput(e.target.value)}
                         autoCapitalize="none"
                         autoCorrect="off"
                         autoComplete="off"
                         style={{ width: '100%', height: '46px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '0 14px', fontSize: '15px', boxSizing: 'border-box' }}
                      />
                   </div>

                   <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '600', color: 'rgba(255,255,255,0.9)' }}>Clé API Google Gemini (Google AI Studio)</label>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                         <input 
                            type="password" 
                            placeholder="Clé API AIzaSy... ou AQ... (facultative en local)" 
                            value={llmApiKey} 
                            onChange={(e) => setLlmApiKey(e.target.value)}
                            autoCapitalize="none"
                            autoCorrect="off"
                            autoComplete="off"
                            style={{ flex: 1, height: '46px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '0 14px', fontSize: '15px', boxSizing: 'border-box' }}
                         />
                         <button
                            type="button"
                            onClick={handleTestApiKey}
                            disabled={isTestingKey}
                            style={{
                               height: '46px',
                               padding: '0 16px',
                               fontSize: '13px',
                               fontWeight: '600',
                               whiteSpace: 'nowrap',
                               display: 'flex',
                               alignItems: 'center',
                               gap: '6px',
                               borderRadius: '10px',
                               backgroundColor: 'rgba(59, 130, 246, 0.15)',
                               border: '1px solid rgba(59, 130, 246, 0.3)',
                               color: '#3b82f6',
                               cursor: 'pointer'
                            }}
                            title="Tester immédiatement la clé API auprès de Google"
                         >
                            <IconRefresh size={16} style={{ animation: isTestingKey ? 'spin 1.5s linear infinite' : 'none' }} />
                            {isTestingKey ? 'Vérification...' : 'Tester la clé'}
                         </button>
                      </div>
                      <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: '1.4' }}>
                         Nécessaire pour le chat contextuel et l'analyse IA. Conservée en sécurité sur votre appareil.
                      </p>
                   </div>

                   {/* Quick Start Button */}
                   <button
                      type="button"
                      onClick={handleSubmitWizard}
                      disabled={initializing}
                      className="action-button"
                      style={{ width: '100%', height: '52px', fontSize: '16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', cursor: 'pointer', marginTop: '8px' }}
                   >
                      {initializing ? (
                         <IconLoader2 style={{ animation: 'spin 1s linear infinite' }} size={20} />
                      ) : (
                         <>🚀 Lancer mon Second Brain</>
                      )}
                   </button>

                   {/* Collapsible Advanced Settings */}
                   <details style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
                      <summary style={{ cursor: 'pointer', fontSize: '13px', color: 'var(--color-vivid-green)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px', userSelect: 'none' }}>
                         ⚙️ Configuration avancée & Sauvegarde (Git / QR / S3)
                      </summary>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
                         <div style={{ display: 'flex', gap: '10px' }}>
                            <button 
                               type="button"
                               onClick={startScanner}
                               className="action-button btn-secondary"
                               style={{ flex: 1, height: '42px', fontSize: '12px', gap: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                            >
                               <IconUser size={16} />
                               Scanner QR Code
                            </button>

                            <button 
                               type="button"
                               onClick={triggerQrFilePicker}
                               className="action-button btn-secondary"
                               style={{ flex: 1, height: '42px', fontSize: '12px', gap: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                            >
                               <IconUser size={16} />
                               Importer QR Image
                            </button>
                            <input 
                               type="file" 
                               id="qr-file-input"
                               accept="image/*" 
                               onChange={handleQrFileSelect} 
                               style={{ display: 'none' }} 
                            />
                         </div>

                         <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '12px', fontWeight: '500', color: 'rgba(255,255,255,0.7)' }}>URL du Dépôt Git (Optionnel)</label>
                            <input 
                               type="text" 
                               placeholder="https://github.com/votre-nom/votre-depot" 
                               value={gitUrl} 
                               onChange={(e) => setGitUrl(e.target.value)}
                               autoCapitalize="none"
                               autoCorrect="off"
                               autoComplete="off"
                               style={{ width: '100%', height: '38px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '0 12px', fontSize: '13px', boxSizing: 'border-box' }}
                            />
                         </div>
                      </div>
                   </details>

                </div>
             </main>
          ) : (
             <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            
            {activeTab === 'chat' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, padding: '20px 20px 0 20px' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                         <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'rgba(255,255,255,0.7)' }}>Session de Chat</span>
                         {messages.length > 1 && (
                            <span className="status-badge status-optimal" style={{ fontSize: '11px', padding: '2px 8px' }}>
                               {messages.length} messages
                            </span>
                         )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                         {messages.length > 1 && (
                            <button
                               type="button"
                               onClick={() => saveConversationAsMarkdown(messages)}
                               className="status-badge status-nominal"
                               style={{ border: 'none', cursor: 'pointer', padding: '4px 10px', fontSize: '11px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8' }}
                               title="Enregistrer la conversation sous forme de document MD"
                            >
                               💾 Sauvegarder en MD
                            </button>
                         )}
                         <button
                            type="button"
                            onClick={() => {
                               setMessages([{ role: 'assistant', content: "Bonjour ! Je suis Modaka. Vous pouvez uploader des PDFs dans l'onglet \"Documents\" pour que je puisse les synthétiser et y accéder, ou simplement me poser des questions." }]);
                            }}
                            className="status-badge"
                            style={{ border: 'none', cursor: 'pointer', padding: '4px 10px', fontSize: '11px', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}
                            title="Nouvelle conversation"
                         >
                            🔄 Nouvelle discussion
                         </button>
                      </div>
                   </div>

                   <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '4px' }}>
                     {messages.map((msg, i) => (
                        <div 
                           key={i} 
                           className={msg.role === 'user' ? 'card-teal' : 'card-grey'}
                           style={{ 
                              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                              maxWidth: '85%',
                              borderBottomRightRadius: msg.role === 'user' ? '4px' : '20px',
                              borderBottomLeftRadius: msg.role === 'assistant' ? '4px' : '20px'
                           }}
                        >
                             <div style={{ fontSize: '16px', lineHeight: '1.5' }}>
                                <Markdown content={msg.content} />
                             </div>
                             {msg.role === 'assistant' && msg.content && (
                                <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '10px' }}>
                                   <button
                                      onClick={() => handleToggleSpeech(msg.content, i)}
                                      style={{
                                         background: 'rgba(255,255,255,0.04)',
                                         border: '1px solid rgba(255,255,255,0.06)',
                                         borderRadius: '8px',
                                         padding: '4px 10px',
                                         color: 'rgba(255,255,255,0.6)',
                                         fontSize: '11px',
                                         display: 'flex',
                                         alignItems: 'center',
                                         gap: '6px',
                                         cursor: 'pointer',
                                         transition: 'all 0.2s ease'
                                      }}
                                      title={speakingIndex === i ? "Arrêter la lecture" : "Écouter la réponse"}
                                   >
                                      {speakingIndex === i ? (
                                         <>
                                            <IconVolumeOff size={14} style={{ color: 'var(--color-vivid-yellow)' }} />
                                            <span>Arrêter</span>
                                         </>
                                      ) : (
                                         <>
                                            <IconVolume size={14} />
                                            <span>Écouter</span>
                                         </>
                                      )}
                                   </button>
                                </div>
                             )}
                             {devMode && msg.devStats && (
                                <div style={{ 
                                   marginTop: '10px',
                                   paddingTop: '8px',
                                   borderTop: '1px solid rgba(255,255,255,0.06)',
                                   fontSize: '11px',
                                   color: 'rgba(255,255,255,0.4)',
                                   fontFamily: 'monospace',
                                   display: 'flex',
                                   flexDirection: 'column',
                                   gap: '3px'
                                }}>
                                   <div>⏱️ Temps total : {msg.devStats.responseTimeMs || 0} ms</div>
                                   {msg.devStats.ioTimeMs !== undefined && (
                                      <div style={{ paddingLeft: '12px' }}>└ 💾 I/O (Bdd / Fichiers) : {msg.devStats.ioTimeMs} ms</div>
                                   )}
                                   {msg.devStats.aiTimeMs !== undefined && (
                                      <div style={{ paddingLeft: '12px' }}>└ 🧠 IA (Gemini API) : {msg.devStats.aiTimeMs} ms</div>
                                   )}
                                   <div>📚 Docs lus : {msg.devStats.metadataDocsCount || 0} résumés, {msg.devStats.fullDocsCount || 0} complets</div>
                                   <div>🪙 Tokens (est.) : {msg.devStats.inputTokensEstimate || 0} in / {msg.devStats.outputTokensEstimate || 0} out (total : {(msg.devStats.inputTokensEstimate || 0) + (msg.devStats.outputTokensEstimate || 0)})</div>
                                </div>
                             )}
                        </div>
                     ))}
                     {sending && (
                        <div className="card-grey" style={{ alignSelf: 'flex-start', maxWidth: '80%', display: 'flex', alignItems: 'center', gap: '10px' }}>
                           <IconLoader2 style={{ animation: 'spin 1s linear infinite' }} size={20} />
                           <span className="secondary-meta">{AppConfig.name} analyse vos documents...</span>
                        </div>
                     )}
                     <div ref={chatEndRef} />
                  </div>

                  <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '10px', padding: '15px 0 20px 0', backgroundColor: 'var(--color-container-bg)' }}>
                     <input 
                        type="text" 
                        className="action-input"
                        placeholder={isDictating ? "Dictée en cours... Parlez maintenant." : "Posez une question sur vos documents..."}
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        disabled={sending}
                     />
                     {!inputMessage.trim() ? (
                        <button 
                           type="button" 
                           onClick={handleDictation}
                           className="action-button" 
                           style={{ 
                              width: '76px', 
                              backgroundColor: isDictating ? '#ef4444' : undefined,
                              borderColor: isDictating ? '#ef4444' : undefined,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: isDictating ? '0 0 12px rgba(239, 68, 68, 0.4)' : undefined,
                           }} 
                           disabled={sending}
                        >
                           {isDictating ? (
                              <IconPlayerStop size={24} style={{ color: '#fff' }} />
                           ) : (
                              <IconMicrophone size={24} style={{ color: '#fff' }} />
                           )}
                        </button>
                     ) : (
                        <button type="submit" className="action-button" style={{ width: '76px' }} disabled={sending}>
                           <IconSend size={24} />
                        </button>
                     )}
                  </form>
               </div>
            )}

            {activeTab === 'docs' && (
               <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px', padding: '20px 20px 30px 20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 style={{ fontSize: '20px', fontWeight: '700', letterSpacing: '-0.5px', margin: 0 }}>Mes documents</h2>
                     </div>
                     
                     <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(5, 1fr)', 
                        gap: '8px',
                        width: '100%'
                     }}>
                        <button 
                           onClick={() => { setImportType('pdf'); setSelectedFiles([]); setShowUploadModal(true); }}
                           style={{ 
                              border: '1px solid rgba(255,255,255,0.06)', 
                              cursor: 'pointer', 
                              padding: '14px 6px', 
                              display: 'flex', 
                              flexDirection: 'column',
                              alignItems: 'center', 
                              justifyContent: 'center',
                              gap: '6px', 
                              background: 'rgba(255,255,255,0.01)', 
                              color: '#fff', 
                              borderRadius: '16px', 
                              transition: 'all 0.2s ease-in-out',
                              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                           }}
                           onMouseEnter={(e) => { 
                              e.currentTarget.style.borderColor = '#38bdf8'; 
                              e.currentTarget.style.background = 'rgba(56, 189, 248, 0.06)';
                              e.currentTarget.style.transform = 'translateY(-2px)';
                           }}
                           onMouseLeave={(e) => { 
                              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; 
                              e.currentTarget.style.background = 'rgba(255,255,255,0.01)';
                              e.currentTarget.style.transform = 'translateY(0)';
                           }}
                        >
                           <IconUpload size={22} style={{ color: '#38bdf8' }} />
                           <span style={{ fontSize: '11px', fontWeight: '600' }}>Fichier</span>
                        </button>
                        
                        <button 
                           onClick={() => { setImportType('image'); setSelectedFiles([]); setShowUploadModal(true); }}
                           style={{ 
                              border: '1px solid rgba(255,255,255,0.06)', 
                              cursor: 'pointer', 
                              padding: '14px 6px', 
                              display: 'flex', 
                              flexDirection: 'column',
                              alignItems: 'center', 
                              justifyContent: 'center',
                              gap: '6px', 
                              background: 'rgba(255,255,255,0.01)', 
                              color: '#fff', 
                              borderRadius: '16px', 
                              transition: 'all 0.2s ease-in-out',
                              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                           }}
                           onMouseEnter={(e) => { 
                              e.currentTarget.style.borderColor = '#c084fc'; 
                              e.currentTarget.style.background = 'rgba(192, 132, 252, 0.06)';
                              e.currentTarget.style.transform = 'translateY(-2px)';
                           }}
                           onMouseLeave={(e) => { 
                              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; 
                              e.currentTarget.style.background = 'rgba(255,255,255,0.01)';
                              e.currentTarget.style.transform = 'translateY(0)';
                           }}
                        >
                           <IconCamera size={22} style={{ color: '#c084fc' }} />
                           <span style={{ fontSize: '11px', fontWeight: '600' }}>Image</span>
                        </button>
                        
                        <button 
                           onClick={() => { setImportType('text'); setSelectedFiles([]); setShowUploadModal(true); }}
                           style={{ 
                              border: '1px solid rgba(255,255,255,0.06)', 
                              cursor: 'pointer', 
                              padding: '14px 6px', 
                              display: 'flex', 
                              flexDirection: 'column',
                              alignItems: 'center', 
                              justifyContent: 'center',
                              gap: '6px', 
                              background: 'rgba(255,255,255,0.01)', 
                              color: '#fff', 
                              borderRadius: '16px', 
                              transition: 'all 0.2s ease-in-out',
                              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                           }}
                           onMouseEnter={(e) => { 
                              e.currentTarget.style.borderColor = '#fbbf24'; 
                              e.currentTarget.style.background = 'rgba(251, 191, 36, 0.06)';
                              e.currentTarget.style.transform = 'translateY(-2px)';
                           }}
                           onMouseLeave={(e) => { 
                              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; 
                              e.currentTarget.style.background = 'rgba(255,255,255,0.01)';
                              e.currentTarget.style.transform = 'translateY(0)';
                           }}
                        >
                           <IconFileText size={22} style={{ color: '#fbbf24' }} />
                           <span style={{ fontSize: '11px', fontWeight: '600' }}>Note</span>
                        </button>
                        
                        <button 
                           onClick={() => { setImportType('audio'); setSelectedFiles([]); setShowUploadModal(true); }}
                           style={{ 
                              border: '1px solid rgba(255,255,255,0.06)', 
                              cursor: 'pointer', 
                              padding: '14px 6px', 
                              display: 'flex', 
                              flexDirection: 'column',
                              alignItems: 'center', 
                              justifyContent: 'center',
                              gap: '6px', 
                              background: 'rgba(255,255,255,0.01)', 
                              color: '#fff', 
                              borderRadius: '16px', 
                              transition: 'all 0.2s ease-in-out',
                              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                           }}
                           onMouseEnter={(e) => { 
                              e.currentTarget.style.borderColor = '#f43f5e'; 
                              e.currentTarget.style.background = 'rgba(244, 63, 94, 0.06)';
                              e.currentTarget.style.transform = 'translateY(-2px)';
                           }}
                           onMouseLeave={(e) => { 
                              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; 
                              e.currentTarget.style.background = 'rgba(255,255,255,0.01)';
                              e.currentTarget.style.transform = 'translateY(0)';
                           }}
                        >
                           <IconMicrophone size={22} style={{ color: '#f43f5e' }} />
                           <span style={{ fontSize: '11px', fontWeight: '600' }}>Vocal</span>
                        </button>
                        
                        <button 
                           onClick={() => { setImportType('url'); setSelectedFiles([]); setShowUploadModal(true); }}
                           style={{ 
                              border: '1px solid rgba(255,255,255,0.06)', 
                              cursor: 'pointer', 
                              padding: '14px 6px', 
                              display: 'flex', 
                              flexDirection: 'column',
                              alignItems: 'center', 
                              justifyContent: 'center',
                              gap: '6px', 
                              background: 'rgba(255,255,255,0.01)', 
                              color: '#fff', 
                              borderRadius: '16px', 
                              transition: 'all 0.2s ease-in-out',
                              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                           }}
                           onMouseEnter={(e) => { 
                              e.currentTarget.style.borderColor = '#2dd4bf'; 
                              e.currentTarget.style.background = 'rgba(45, 212, 191, 0.06)';
                              e.currentTarget.style.transform = 'translateY(-2px)';
                           }}
                           onMouseLeave={(e) => { 
                              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; 
                              e.currentTarget.style.background = 'rgba(255,255,255,0.01)';
                              e.currentTarget.style.transform = 'translateY(0)';
                           }}
                        >
                           <IconDownload size={22} style={{ color: '#2dd4bf' }} />
                           <span style={{ fontSize: '11px', fontWeight: '600' }}>Lien</span>
                        </button>
                     </div>
                  </div>

                  {queueTasks.some(t => t.status === 'pending' || t.status === 'processing' || t.status === 'failed') && (
                     <div 
                        onClick={() => setShowQueueModal(true)}
                        style={{ 
                           backgroundColor: 'rgba(255, 255, 255, 0.02)', 
                           padding: '12px 16px', 
                           borderRadius: '16px', 
                           border: '1px solid rgba(255, 255, 255, 0.06)', 
                           display: 'flex', 
                           alignItems: 'center', 
                           justifyContent: 'space-between',
                           cursor: 'pointer',
                           transition: 'all 0.2s ease',
                           gap: '12px'
                        }}
                        onMouseEnter={(e) => {
                           e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                           e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                        }}
                        onMouseLeave={(e) => {
                           e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)';
                           e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                        }}
                     >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                           {queueTasks.some(t => t.status === 'pending' || t.status === 'processing') ? (
                              <IconLoader2 size={16} style={{ animation: 'spin 1.5s linear infinite', color: 'var(--color-vivid-yellow)', flexShrink: 0 }} />
                           ) : (
                              <span style={{ color: '#ef4444', fontSize: '14px', flexShrink: 0 }}>⚠️</span>
                           )}
                           <span style={{ fontSize: '13px', fontWeight: '600', color: 'rgba(255,255,255,0.9)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              File d'attente :{' '}
                              {[
                                 queueTasks.filter(t => t.status === 'pending' || t.status === 'processing').length > 0
                                    ? `${queueTasks.filter(t => t.status === 'pending' || t.status === 'processing').length} action(s) en attente`
                                    : null,
                                 queueTasks.filter(t => t.status === 'failed').length > 0
                                    ? `${queueTasks.filter(t => t.status === 'failed').length} erreur(s)`
                                    : null
                              ].filter(Boolean).join(', ')}
                           </span>
                        </div>
                        <span style={{ fontSize: '11px', color: '#00e599', fontWeight: '600', flexShrink: 0 }}>Voir les détails ➔</span>
                     </div>
                  )}

                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
                     <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                        <input 
                           type="text"
                           placeholder="Rechercher par mot-clé (titre, résumé, contenu, tag)..."
                           value={searchQuery}
                           onChange={(e) => setSearchQuery(e.target.value)}
                           className="action-input"
                           style={{ width: '100%', boxSizing: 'border-box', paddingLeft: '36px', height: '42px', fontSize: '14px' }}
                        />
                        <span style={{ position: 'absolute', left: '12px', top: '11px', color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>🔍</span>
                     </div>
                     <button
                        onClick={() => setShowCategoryModal(true)}
                        className="action-button btn-secondary"
                        style={{ height: '42px', padding: '0 16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', whiteSpace: 'nowrap', border: '1px solid rgba(255,255,255,0.08)' }}
                     >
                        📁 Catégorie : <span style={{ fontWeight: 'bold', color: 'var(--color-vivid-green)' }}>{categoryFilter === 'all' ? 'Toutes' : categoryFilter}</span>
                     </button>
                  </div>

                  {selectedDoc && (
                      <div 
                         style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: 'rgba(9, 13, 22, 0.85)',
                            backdropFilter: 'blur(12px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1000,
                            padding: '20px',
                            boxSizing: 'border-box'
                         }}
                         onClick={(e) => {
                            if (e.target === e.currentTarget) {
                               setSelectedDoc(null);
                            }
                         }}
                      >
                         <div 
                            className={getCategoryCardClass(selectedDoc.category)} 
                            style={{ 
                               display: 'flex', 
                               flexDirection: 'column', 
                               gap: '16px',
                               maxWidth: '750px',
                               width: '100%',
                               maxHeight: '90vh',
                               overflowY: 'auto',
                               padding: '28px',
                               borderRadius: '24px',
                               border: '1px solid rgba(255,255,255,0.08)',
                               boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
                               position: 'relative',
                               textAlign: 'left'
                            }}
                         >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                               <h2 style={{ fontSize: '22px', fontWeight: 'bold', margin: 0 }}>{selectedDoc.title}</h2>
                               <button 
                                  onClick={() => setSelectedDoc(null)} 
                                  style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', fontWeight: 900, cursor: 'pointer', opacity: 0.6 }}
                               >
                                  ✕
                               </button>
                            </div>
                            
                            <p style={{ fontSize: '15px', opacity: 0.9, lineHeight: '1.6', margin: 0 }}>{selectedDoc.summary}</p>
                            
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                               {selectedDoc.tags?.map((t, idx) => (
                                  <span key={idx} className="status-badge status-nominal" style={{ fontSize: '11px', padding: '4px 10px' }}>
                                     <IconTag size={10} style={{ marginRight: '4px' }} />
                                     {t}
                                  </span>
                               ))}
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>
                               <span>Créé le : {selectedDoc.createdAt ? new Date(selectedDoc.createdAt).toLocaleDateString('fr-FR') : 'N/A'}</span>
                               {selectedDoc.documentDate && (
                                  <span style={{ color: 'var(--color-vivid-green)', fontWeight: '500' }}>
                                     📅 Événement : {new Date(selectedDoc.documentDate).toLocaleDateString('fr-FR')}
                                  </span>
                               )}
                            </div>

                            {selectedDoc.contextNote && (
                               <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '12px', fontSize: '13px', borderLeft: '3px solid var(--color-vivid-green)', marginTop: '8px' }}>
                                  <strong>Note de contexte :</strong> {selectedDoc.contextNote}
                               </div>
                            )}

                            {selectedDoc.body && (
                               <div style={{ 
                                  marginTop: '12px',
                                  borderTop: '1px solid rgba(255,255,255,0.08)',
                                  paddingTop: '16px',
                                  color: 'rgba(255,255,255,0.85)'
                               }}>
                                  <h4 style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Contenu du document :</h4>
                                  <div style={{ color: 'rgba(255,255,255,0.85)', lineHeight: '1.6' }}>
                                     <Markdown content={selectedDoc.body} />
                                  </div>
                               </div>
                            )}

                            {((selectedDoc.links && selectedDoc.links.length > 0) || (selectedDoc.backlinks && selectedDoc.backlinks.length > 0)) && (
                               <div style={{ 
                                  marginTop: '16px',
                                  borderTop: '1px solid rgba(255,255,255,0.08)',
                                  paddingTop: '16px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '12px'
                               }}>
                                  {selectedDoc.links && selectedDoc.links.length > 0 && (
                                     <div>
                                        <h4 style={{ fontSize: '11px', fontWeight: 'bold', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                                           Liens sortants
                                        </h4>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                           {selectedDoc.links.map((linkUid) => {
                                              const cleanUid = linkUid.replace(/\.md$/, '').split('/').pop() || '';
                                              const targetDoc = documents.find(d => d.id === cleanUid);
                                              if (targetDoc) {
                                                 return (
                                                    <button
                                                       key={linkUid}
                                                       onClick={() => setSelectedDoc(targetDoc)}
                                                       className="status-badge status-optimal"
                                                       style={{ fontSize: '11px', padding: '4px 10px', cursor: 'pointer', border: 'none', background: 'rgba(52, 211, 153, 0.1)', color: '#34d399', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                    >
                                                       <span>🔗 {targetDoc.title || cleanUid}</span>
                                                    </button>
                                                 );
                                              } else {
                                                 return (
                                                    <span
                                                       key={linkUid}
                                                       className="status-badge"
                                                       style={{ fontSize: '11px', padding: '4px 10px', background: 'rgba(255, 255, 255, 0.05)', color: 'rgba(255,255,255,0.4)', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.2)', display: 'inline-block' }}
                                                       title="Ce document n'existe pas encore"
                                                    >
                                                       ❓ {cleanUid}
                                                    </span>
                                                 );
                                              }
                                           })}
                                        </div>
                                     </div>
                                  )}
                                  
                                  {selectedDoc.backlinks && selectedDoc.backlinks.length > 0 && (
                                     <div>
                                        <h4 style={{ fontSize: '11px', fontWeight: 'bold', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                                           Références (Backlinks)
                                        </h4>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                           {selectedDoc.backlinks.map((backlink) => {
                                              const targetDoc = documents.find(d => d.id === backlink.id);
                                              return (
                                                 <button
                                                    key={backlink.id}
                                                    onClick={() => {
                                                       if (targetDoc) {
                                                          setSelectedDoc(targetDoc);
                                                       }
                                                    }}
                                                    className="status-badge status-nominal"
                                                    style={{ fontSize: '11px', padding: '4px 10px', cursor: 'pointer', border: 'none', background: 'rgba(96, 165, 250, 0.1)', color: '#60a5fa', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                 >
                                                    <span>⬅️ {backlink.title}</span>
                                                 </button>
                                              );
                                           })}
                                        </div>
                                     </div>
                                  )}
                               </div>
                            )}

                            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                               <p className="secondary-meta" style={{ fontSize: '13px', margin: 0 }}>Catégorie :</p>
                               <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span className="status-badge status-optimal" style={{ fontSize: '12px', padding: '6px 12px' }}>
                                     {selectedDoc.category || 'inbox'}
                                  </span>
                                  <button 
                                     onClick={() => setShowClassifyModal(true)}
                                     className="status-badge status-nominal"
                                     style={{ border: 'none', cursor: 'pointer', padding: '6px 12px', fontSize: '12px', background: 'rgba(255,255,255,0.08)' }}
                                     title="Choisir une autre catégorie"
                                  >
                                     ...
                                  </button>
                               </div>
                            </div>

                            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                               <button 
                                  onClick={() => {
                                     setSelectedDoc(null);
                                     setMessages(prev => [
                                        ...prev,
                                        { role: 'user', content: `Parle-moi du document : "${selectedDoc.title}"` }
                                     ]);
                                     setActiveTab('chat');
                                  }}
                                  className="action-button"
                                  style={{ flex: 1, height: '56px', fontSize: '15px' }}
                               >
                                  <IconMessage size={18} />
                                  Poser une question
                               </button>
                               <button 
                                   onClick={() => handleReprocessDocument(selectedDoc)}
                                   disabled={isReprocessing}
                                   className="action-button btn-secondary"
                                   style={{ height: '56px', padding: '0 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}
                                   title="Re-exécuter l'analyse IA et l'extraction d'artistes/concepts"
                                >
                                   <IconRefresh size={18} className={isReprocessing ? 'animate-spin' : ''} />
                                   {isReprocessing ? 'Analyse...' : 'Rejouer l\'analyse IA'}
                                </button>
                               <button 
                                  onClick={() => setDocToDelete(selectedDoc)}
                                  className="action-button btn-secondary"
                                  style={{ width: '56px', height: '56px', padding: 0 }}
                               >
                                  <IconTrash size={24} />
                               </button>
                            </div>

                            {selectedDoc.originalFileUri && (selectedDoc.originalFileUri.startsWith('http://') || selectedDoc.originalFileUri.startsWith('https://')) && (
                               <button 
                                  onClick={() => {
                                     setSelectedDoc(null);
                                     setImportType('url');
                                     setUrlInput(selectedDoc.originalFileUri || '');
                                     setCrawlDepth(0);
                                     setShowUploadModal(true);
                                  }}
                                  className="action-button btn-secondary"
                                  style={{ width: '100%', height: '48px', marginTop: '10px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                               >
                                  <IconRefresh size={16} /> Ré-explorer ce site web / Mettre à jour
                               </button>
                            )}

                            {devMode && (
                               <>
                                  <button 
                                     onClick={() => setShowRawViewer(!showRawViewer)}
                                     className="action-button btn-secondary"
                                     style={{ width: '100%', height: '48px', marginTop: '10px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                  >
                                     📄 {showRawViewer ? "Masquer le brut" : "Voir le document brut (OKF)"}
                                  </button>
                                  {showRawViewer && (
                                     <div style={{ marginTop: '10px', width: '100%', boxSizing: 'border-box' }}>
                                        <pre style={{
                                           background: '#090d16',
                                           padding: '16px',
                                           borderRadius: '12px',
                                           border: '1px solid rgba(255,255,255,0.08)',
                                           fontFamily: 'monospace',
                                           fontSize: '12px',
                                           color: '#a9b2c3',
                                           overflowX: 'auto',
                                           whiteSpace: 'pre-wrap',
                                           wordBreak: 'break-all',
                                           margin: 0,
                                           textAlign: 'left'
                                        }}>
                                           {buildRawOKF(selectedDoc)}
                                        </pre>
                                     </div>
                                  )}
                               </>
                            )}
                         </div>
                      </div>
                   )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
                     {filteredDocs.length === 0 ? (
                        <div className="card-grey" style={{ textAlign: 'center', padding: '40px' }}>
                           <p className="secondary-meta">Aucun document dans cette catégorie.</p>
                        </div>
                     ) : (
                        filteredDocs.map(doc => (
                           <div 
                              key={doc.id}
                              className={getCategoryCardClass(doc.category)}
                              onClick={() => setSelectedDoc(doc)}
                              style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '10px', transition: 'transform 0.2s', position: 'relative' }}
                           >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                                 <h3 style={{ fontSize: '18px', margin: 0, flex: 1 }}>{doc.title}</h3>

                                 <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                     {doc.originalFileUri && (doc.originalFileUri.startsWith('http://') || doc.originalFileUri.startsWith('https://')) && (
                                        <button
                                           onClick={(e) => {
                                              e.stopPropagation();
                                              setImportType('url');
                                              setUrlInput(doc.originalFileUri || '');
                                              setCrawlDepth(0);
                                              setShowUploadModal(true);
                                           }}
                                           style={{
                                              background: 'none',
                                              border: 'none',
                                              color: 'rgba(255, 255, 255, 0.4)',
                                              cursor: 'pointer',
                                              padding: '4px 8px',
                                              borderRadius: '8px',
                                              transition: 'all 0.2s ease',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center'
                                           }}
                                           onMouseOver={(e) => {
                                              e.currentTarget.style.color = 'var(--color-vivid-green)';
                                              e.currentTarget.style.backgroundColor = 'rgba(0, 230, 118, 0.1)';
                                           }}
                                           onMouseOut={(e) => {
                                              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)';
                                              e.currentTarget.style.backgroundColor = 'transparent';
                                           }}
                                           title="Ré-explorer / Mettre à jour ce site"
                                        >
                                           <IconRefresh size={16} />
                                        </button>
                                     )}
                                     <button 
                                        onClick={(e) => {
                                           e.stopPropagation();
                                           setDocToDelete(doc);
                                        }}
                                        style={{
                                           background: 'none',
                                           border: 'none',
                                           color: 'rgba(255, 255, 255, 0.4)',
                                           cursor: 'pointer',
                                           padding: '4px 8px',
                                           borderRadius: '8px',
                                           transition: 'all 0.2s ease',
                                           display: 'flex',
                                           alignItems: 'center',
                                           justifyContent: 'center'
                                        }}
                                        onMouseOver={(e) => {
                                           e.currentTarget.style.color = '#ef4444';
                                           e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                                        }}
                                        onMouseOut={(e) => {
                                           e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)';
                                           e.currentTarget.style.backgroundColor = 'transparent';
                                        }}
                                        title="Supprimer ce document"
                                     >
                                        <IconTrash size={16} />
                                     </button>
                                  </div>
                               </div>
                              <p className="secondary-meta" style={{ fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', margin: 0, flex: 1 }}>
                                 {doc.summary}
                              </p>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '8px' }}>
                                 <span className="status-badge status-nominal" style={{ fontSize: '11px', padding: '4px 10px' }}>
                                    {doc.category}
                                 </span>
                                 <span className="secondary-meta" style={{ fontSize: '12px' }}>
                                    {formatRelativeDate(doc.documentDate || doc.createdAt)}
                                 </span>
                              </div>
                           </div>
                        ))
                     )}
                  </div>
                  
                  <button 
                     onClick={handleReindex}
                     className="action-button btn-secondary"
                     disabled={reindexing}
                     style={{ 
                        marginTop: '10px',
                        height: '52px',
                        fontSize: '15px',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                     }}
                  >
                     {reindexing ? (
                        <IconLoader2 style={{ animation: 'spin 1s linear infinite' }} size={22} />
                     ) : (
                        'Réindexer les dossiers (Regénérer les index.md)'
                     )}
                  </button>
               </div>
            )}

            {activeTab === 'stats' && (
               <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px', padding: '20px 20px 30px 20px' }}>
                  {/* Header & Mode Switcher Pills */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 style={{ fontSize: '20px', fontWeight: '700', letterSpacing: '-0.5px', margin: 0 }}>Statistiques de la base</h2>
                        <span style={{ fontSize: '12px', color: 'var(--color-vivid-green)', fontWeight: '600', backgroundColor: 'rgba(34, 197, 94, 0.1)', padding: '4px 10px', borderRadius: '8px' }}>
                           {documents.length} document{documents.length > 1 ? 's' : ''} indexé{documents.length > 1 ? 's' : ''}
                        </span>
                     </div>

                     {/* Mode Selector Tabs */}
                     <div style={{ display: 'flex', gap: '8px', backgroundColor: 'rgba(255,255,255,0.02)', padding: '4px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <button
                           type="button"
                           onClick={() => setStatsMode('table')}
                           style={{
                              flex: 1,
                              padding: '8px 12px',
                              borderRadius: '8px',
                              border: 'none',
                              backgroundColor: statsMode === 'table' ? 'var(--color-card-teal)' : 'transparent',
                              color: statsMode === 'table' ? 'var(--color-vivid-green)' : 'rgba(255,255,255,0.6)',
                              fontSize: '12px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease'
                           }}
                        >
                           📊 Mode 1 : Tableau Synthétique
                        </button>

                        <button
                           type="button"
                           onClick={() => setStatsMode('categories')}
                           style={{
                              flex: 1,
                              padding: '8px 12px',
                              borderRadius: '8px',
                              border: 'none',
                              backgroundColor: statsMode === 'categories' ? 'var(--color-card-teal)' : 'transparent',
                              color: statsMode === 'categories' ? 'var(--color-vivid-green)' : 'rgba(255,255,255,0.6)',
                              fontSize: '12px',
                                     fontWeight: '600',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease'
                           }}
                        >
                           🕸️ Mode 2 : Graphe de Liens
                        </button>

                        <button
                           type="button"
                           onClick={() => setStatsMode('performance')}
                           style={{
                              flex: 1,
                              padding: '8px 12px',
                              borderRadius: '8px',
                              border: 'none',
                              backgroundColor: statsMode === 'performance' ? 'var(--color-card-teal)' : 'transparent',
                              color: statsMode === 'performance' ? 'var(--color-vivid-green)' : 'rgba(255,255,255,0.6)',
                              fontSize: '12px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease'
                           }}
                        >
                           ⚡ Mode 3 : Métriques I/O & IA
                        </button>
                     </div>
                  </div>

                  {/* Key Metrics Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                     <div className="card-teal" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '11px', opacity: 0.7, fontWeight: '600' }}>DOCUMENTS</span>
                        <span style={{ fontSize: '24px', fontWeight: '900', color: 'var(--color-vivid-green)' }}>{statsData.totalDocs}</span>
                     </div>
                     <div className="card-teal" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '11px', opacity: 0.7, fontWeight: '600' }}>LIENS INTER-DOCS</span>
                        <span style={{ fontSize: '24px', fontWeight: '900', color: '#38bdf8' }}>{statsData.totalLinks}</span>
                     </div>
                     <div className="card-teal" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '11px', opacity: 0.7, fontWeight: '600' }}>MÉDIAS & FICHIERS</span>
                        <span style={{ fontSize: '24px', fontWeight: '900', color: '#c084fc' }}>{statsData.mediaCount}</span>
                     </div>
                     <div className="card-teal" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '11px', opacity: 0.7, fontWeight: '600' }}>MOTS INDEXÉS</span>
                        <span style={{ fontSize: '24px', fontWeight: '900', color: 'var(--color-vivid-yellow)' }}>{statsData.totalWords.toLocaleString()}</span>
                     </div>
                  </div>

                  {/* Mode 1: Tableau récapitulatif avec nombre de docs, liens, médias */}
                  {statsMode === 'table' && (
                     <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--color-vivid-green)', margin: 0 }}>
                           📊 Mode 1 : Tableau Synthétique des Ressources
                        </h3>

                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                           <thead>
                              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
                                 <th style={{ padding: '10px 12px' }}>Ressource / Métrique</th>
                                 <th style={{ padding: '10px 12px' }}>Total</th>
                                 <th style={{ padding: '10px 12px' }}>Description / Détails</th>
                              </tr>
                           </thead>
                           <tbody>
                              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                 <td style={{ padding: '12px', fontWeight: 'bold', color: 'white' }}>📄 Nombre de Documents</td>
                                 <td style={{ padding: '12px', color: 'var(--color-vivid-green)', fontWeight: 'bold' }}>{statsData.totalDocs}</td>
                                 <td style={{ padding: '12px', opacity: 0.7 }}>Total des fiches OKF conservées localement</td>
                              </tr>
                              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                 <td style={{ padding: '12px', fontWeight: 'bold', color: 'white' }}>🔗 Liens entre Documents</td>
                                 <td style={{ padding: '12px', color: '#38bdf8', fontWeight: 'bold' }}>{statsData.totalLinks}</td>
                                 <td style={{ padding: '12px', opacity: 0.7 }}>Hyperliens de référence et maillage croisé</td>
                              </tr>
                              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                 <td style={{ padding: '12px', fontWeight: 'bold', color: 'white' }}>🖼️ Fichiers Médias</td>
                                 <td style={{ padding: '12px', color: '#c084fc', fontWeight: 'bold' }}>{statsData.mediaCount}</td>
                                 <td style={{ padding: '12px', opacity: 0.7 }}>Documents PDF, images et fichiers audio stockés</td>
                              </tr>
                              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                 <td style={{ padding: '12px', fontWeight: 'bold', color: 'white' }}>✍️ Nombre de Mots</td>
                                 <td style={{ padding: '12px', color: 'var(--color-vivid-yellow)', fontWeight: 'bold' }}>{statsData.totalWords.toLocaleString()}</td>
                                 <td style={{ padding: '12px', opacity: 0.7 }}>Volume global de texte dans la base de connaissances</td>
                              </tr>
                              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                 <td style={{ padding: '12px', fontWeight: 'bold', color: 'white' }}>💬 Conversations Archivées</td>
                                 <td style={{ padding: '12px', color: '#2dd4bf', fontWeight: 'bold' }}>{conversationDocs.length}</td>
                                 <td style={{ padding: '12px', opacity: 0.7 }}>Sessions de chat sauvegardées sous forme de documents MD</td>
                              </tr>
                              <tr>
                                 <td style={{ padding: '12px', fontWeight: 'bold', color: 'white' }}>📁 Catégorie Dominante</td>
                                 <td style={{ padding: '12px', color: 'white', fontWeight: 'bold' }}>{statsData.topCategory}</td>
                                 <td style={{ padding: '12px', opacity: 0.7 }}>Thématique la plus active</td>
                              </tr>
                           </tbody>
                        </table>
                     </div>
                  )}

                  {/* Mode 2: Graphe des liens inter-documents */}
                  {statsMode === 'categories' && (
                     <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                           <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--color-vivid-green)', margin: 0 }}>
                              🕸️ Mode 2 : Graphe des Liens Inter-Documents
                           </h3>
                           <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                              Survolez un nœud pour afficher les détails
                           </span>
                        </div>

                        {graphData.nodes.length === 0 ? (
                           <p style={{ opacity: 0.6, fontSize: '13px' }}>Aucun document indexé pour le moment.</p>
                        ) : (
                           <div style={{ position: 'relative', width: '100%', height: '360px', backgroundColor: '#0e1118', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                              <svg viewBox="0 0 600 340" style={{ width: '100%', height: '100%', display: 'block' }}>
                                 <defs>
                                    <filter id="nodeGlow" x="-30%" y="-30%" width="160%" height="160%">
                                       <feGaussianBlur stdDeviation="4" result="blur" />
                                       <feComposite in="SourceGraphic" in2="blur" operator="over" />
                                    </filter>
                                 </defs>

                                 {/* Render Edges */}
                                 {graphData.edges.map((edge, idx) => {
                                    const isHighlighted = hoveredNode && (hoveredNode.id === edge.sourceId || hoveredNode.id === edge.targetId);
                                    return (
                                       <line
                                          key={idx}
                                          x1={edge.x1}
                                          y1={edge.y1}
                                          x2={edge.x2}
                                          y2={edge.y2}
                                          stroke={isHighlighted ? 'var(--color-vivid-green)' : edge.isDirect ? '#38bdf8' : 'rgba(255, 255, 255, 0.12)'}
                                          strokeWidth={isHighlighted ? 2.5 : edge.isDirect ? 1.5 : 1}
                                          strokeDasharray={edge.isDirect ? 'none' : '4 4'}
                                          style={{ transition: 'all 0.2s ease' }}
                                       />
                                    );
                                 })}

                                 {/* Render Nodes */}
                                 {graphData.nodes.map((node) => {
                                    const isHovered = hoveredNode?.id === node.id;
                                    return (
                                       <g 
                                          key={node.id} 
                                          style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                                          onMouseEnter={() => setHoveredNode(node)}
                                          onMouseLeave={() => setHoveredNode(null)}
                                          onClick={() => {
                                             setSelectedDoc(node.doc);
                                             setActiveTab('docs');
                                          }}
                                       >
                                          {/* Outer halo */}
                                          <circle
                                             cx={node.x}
                                             cy={node.y}
                                             r={isHovered ? 24 : 16}
                                             fill={node.color}
                                             fillOpacity={isHovered ? 0.35 : 0.15}
                                             stroke={node.color}
                                             strokeWidth={isHovered ? 2 : 1}
                                             style={{ transition: 'all 0.2s ease' }}
                                          />

                                          {/* Center core */}
                                          <circle
                                             cx={node.x}
                                             cy={node.y}
                                             r={isHovered ? 10 : 7}
                                             fill={node.color}
                                             filter={isHovered ? 'url(#nodeGlow)' : undefined}
                                             style={{ transition: 'all 0.2s ease' }}
                                          />

                                          {/* Text Label */}
                                          <text
                                             x={node.x}
                                             y={node.y + 24}
                                             textAnchor="middle"
                                             fill={isHovered ? '#fff' : 'rgba(255,255,255,0.7)'}
                                             fontSize={isHovered ? '11px' : '10px'}
                                             fontWeight={isHovered ? '700' : '500'}
                                             style={{ transition: 'all 0.2s ease', pointerEvents: 'none' }}
                                          >
                                             {node.title.length > 16 ? node.title.substring(0, 14) + '...' : node.title}
                                          </text>
                                       </g>
                                    );
                                 })}
                              </svg>

                              {/* Floating Hover Details Card */}
                              {hoveredNode && (
                                 <div 
                                    style={{
                                       position: 'absolute',
                                       bottom: '14px',
                                       left: '14px',
                                       right: '14px',
                                       backgroundColor: 'rgba(18, 24, 38, 0.95)',
                                       backdropFilter: 'blur(12px)',
                                       border: `1px solid ${hoveredNode.color}`,
                                       borderRadius: '12px',
                                       padding: '12px 14px',
                                       display: 'flex',
                                       flexDirection: 'column',
                                       gap: '6px',
                                       boxShadow: '0 10px 25px rgba(0,0,0,0.6)',
                                       pointerEvents: 'none',
                                       zIndex: 10
                                    }}
                                 >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                       <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#fff' }}>
                                          📄 {hoveredNode.title}
                                       </span>
                                       <span className="status-badge status-nominal" style={{ fontSize: '10px', padding: '2px 8px' }}>
                                          {hoveredNode.category}
                                       </span>
                                    </div>
                                    <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                       {hoveredNode.summary}
                                    </p>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>
                                       <span>📅 {formatRelativeDate(hoveredNode.date)}</span>
                                       <span>👉 Clic pour ouvrir la fiche</span>
                                    </div>
                                 </div>
                              )}
                           </div>
                        )}
                     </div>
                  )}

                  {/* Mode 3: Historique des Conversations & Métriques IA */}
                  {statsMode === 'performance' && (
                     <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                           <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--color-vivid-green)', margin: 0 }}>
                              ⚡ Mode 3 : Historique des Conversations & Métriques IA
                           </h3>
                           <span className="status-badge status-optimal" style={{ fontSize: '11px', padding: '4px 10px' }}>
                              {conversationDocs.length} conversation(s) archivée(s)
                           </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '13px' }}>
                           <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
                              <span style={{ opacity: 0.6, fontSize: '12px' }}>Modèle LLM Actif</span>
                              <div style={{ fontWeight: 'bold', color: 'white', marginTop: '4px', fontSize: '14px' }}>Google Gemini 2.5 Flash</div>
                           </div>
                           <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
                              <span style={{ opacity: 0.6, fontSize: '12px' }}>Stockage des Conversations</span>
                              <div style={{ fontWeight: 'bold', color: 'white', marginTop: '4px', fontSize: '14px' }}>`content/conversations/` (MD OKF)</div>
                           </div>
                        </div>

                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                           <h4 style={{ fontSize: '14px', fontWeight: 'bold', color: 'rgba(255,255,255,0.8)', margin: 0 }}>
                              Fichiers Markdown de Conversations Registrées
                           </h4>

                           {conversationDocs.length === 0 ? (
                              <p style={{ opacity: 0.6, fontSize: '13px', margin: 0 }}>Aucune conversation archivée pour l'instant. Les sessions du Chat seront conservées sous forme de documents Markdown réutilisables par le LLM.</p>
                           ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                 {conversationDocs.map(cDoc => (
                                    <div 
                                       key={cDoc.id}
                                       style={{
                                          backgroundColor: 'rgba(255,255,255,0.03)',
                                          border: '1px solid rgba(255,255,255,0.06)',
                                          borderRadius: '12px',
                                          padding: '14px',
                                          display: 'flex',
                                          justifyContent: 'space-between',
                                          alignItems: 'center',
                                          gap: '12px'
                                       }}
                                    >
                                       <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                             <span style={{ fontWeight: 'bold', fontSize: '14px', color: '#fff' }}>💬 {cDoc.title}</span>
                                             <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>📅 {formatRelativeDate(cDoc.createdAt)}</span>
                                          </div>
                                          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', margin: 0 }}>
                                             {cDoc.summary || cDoc.contextNote || 'Document Markdown de conversation.'}
                                          </p>
                                       </div>

                                       <div style={{ display: 'flex', gap: '8px' }}>
                                          <button
                                             onClick={() => {
                                                setSelectedDoc(cDoc);
                                                setActiveTab('docs');
                                             }}
                                             className="status-badge"
                                             style={{ border: 'none', cursor: 'pointer', padding: '6px 12px', fontSize: '11px', background: 'rgba(255,255,255,0.08)', color: '#fff' }}
                                             title="Consulter le fichier MD brut de la conversation"
                                          >
                                             📄 Voir la note MD
                                          </button>
                                       </div>
                                    </div>
                                 ))}
                              </div>
                           )}
                        </div>
                     </div>
                  )}
               </div>
            )}

          {showClassifyModal && selectedDoc && (
             <div 
                style={{
                   position: 'fixed',
                   top: 0,
                   left: 0,
                   right: 0,
                   bottom: 0,
                   backgroundColor: 'rgba(9, 13, 22, 0.85)',
                   backdropFilter: 'blur(12px)',
                   display: 'flex',
                   alignItems: 'center',
                   justifyContent: 'center',
                   zIndex: 1000,
                   padding: '20px',
                   boxSizing: 'border-box'
                }}
                onClick={(e) => {
                   if (e.target === e.currentTarget) {
                      setShowClassifyModal(false);
                   }
                }}
             >
                <div 
                   style={{
                      backgroundColor: '#131924',
                      padding: '24px',
                      borderRadius: '24px',
                      border: '1px solid rgba(255,255,255,0.08)',
                      maxWidth: '500px',
                      width: '100%',
                      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '16px',
                      boxSizing: 'border-box'
                   }}
                >
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>Classer le document</h3>
                      <button 
                         onClick={() => setShowClassifyModal(false)}
                         style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', fontWeight: 900, cursor: 'pointer', opacity: 0.6 }}
                      >
                         ✕
                      </button>
                   </div>

                   <p className="secondary-meta" style={{ fontSize: '14px', margin: 0 }}>
                      Sélectionnez une catégorie existante :
                   </p>

                   <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '160px', overflowY: 'auto', padding: '4px' }}>
                      {['inbox', 'work', 'personal', 'urgent', ...Array.from(new Set(documents.map(d => d?.category).filter(Boolean) as string[]))].filter((value, index, self) => self.indexOf(value) === index).map(cat => (
                         <button 
                            key={cat}
                            onClick={async () => {
                               await handleUpdateCategory(selectedDoc, cat);
                               setShowClassifyModal(false);
                            }}
                            className={`status-badge ${selectedDoc.category === cat ? 'status-optimal' : 'status-nominal'}`}
                            style={{ border: 'none', cursor: 'pointer', padding: '8px 14px', fontSize: '13px', borderRadius: '12px' }}
                         >
                            {cat}
                         </button>
                      ))}
                   </div>

                   <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', fontWeight: 'bold' }}>Créer une nouvelle catégorie :</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                         <input 
                            type="text"
                            placeholder="Nom de la catégorie..."
                            value={customCategoryInput}
                            onChange={(e) => setCustomCategoryInput(e.target.value)}
                            style={{
                               flex: 1,
                               backgroundColor: 'rgba(255,255,255,0.05)',
                               border: '1px solid rgba(255,255,255,0.1)',
                               borderRadius: '12px',
                               padding: '10px 14px',
                               color: '#fff',
                               fontSize: '14px'
                            }}
                            onKeyDown={async (e) => {
                               if (e.key === 'Enter') {
                                  const trimmed = customCategoryInput.trim();
                                  if (trimmed) {
                                     await handleUpdateCategory(selectedDoc, trimmed);
                                     setCustomCategoryInput('');
                                     setShowClassifyModal(false);
                                  }
                               }
                            }}
                         />
                         <button
                            onClick={async () => {
                               const trimmed = customCategoryInput.trim();
                               if (trimmed) {
                                  await handleUpdateCategory(selectedDoc, trimmed);
                                  setCustomCategoryInput('');
                                  setShowClassifyModal(false);
                               }
                            }}
                            className="status-badge status-optimal"
                            style={{ border: 'none', cursor: 'pointer', padding: '10px 18px', fontSize: '13px', borderRadius: '12px', fontWeight: 'bold' }}
                         >
                            Appliquer
                         </button>
                      </div>
                   </div>
                </div>
             </div>
          )}

         {showUploadModal && (
            <div 
               style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(9, 13, 22, 0.85)',
                  backdropFilter: 'blur(12px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1000,
                  padding: '20px',
                  boxSizing: 'border-box'
               }}
               onClick={(e) => {
                  if (e.target === e.currentTarget) {
                     setShowUploadModal(false);
                  }
               }}
            >
               <div 
                  style={{
                     backgroundColor: '#131924',
                     padding: '24px',
                     borderRadius: '24px',
                     border: '1px solid rgba(255,255,255,0.08)',
                     maxWidth: '500px',
                     width: '100%',
                     boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
                     display: 'flex',
                     flexDirection: 'column',
                     gap: '16px',
                     position: 'relative'
                  }}
               >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <h3 style={{ fontSize: '18px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {importType === 'pdf' && <><IconUpload size={20} style={{ color: '#38bdf8' }} /> Importer des fichiers PDF</>}
                        {importType === 'image' && <><IconCamera size={20} style={{ color: '#c084fc' }} /> Importer des images</>}
                        {importType === 'url' && <><IconDownload size={20} style={{ color: '#2dd4bf' }} /> Importer un lien Web</>}
                        {importType === 'text' && <><IconFileText size={20} style={{ color: '#fbbf24' }} /> Créer une note</>}
                        {importType === 'audio' && <><IconMicrophone size={20} style={{ color: '#f43f5e' }} /> Enregistrer une note vocale</>}
                     </h3>
                     <button 
                        onClick={() => {
                           setShowUploadModal(false);
                           stopRecording();
                        }}
                        style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer', opacity: 0.6 }}
                     >
                        ✕
                     </button>
                  </div>

                  <form onSubmit={handleUnifiedImport} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                     {importType === 'pdf' && (
                        <div>
                           <label style={{ display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', height: 'auto', minHeight: '48px', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: '12px', cursor: 'pointer', backgroundColor: 'rgba(255,255,255,0.01)', transition: 'border-color 0.2s', width: '100%', padding: '8px 12px', boxSizing: 'border-box' }}>
                              <span style={{ fontSize: '14px', color: selectedFiles.length > 0 ? 'var(--color-vivid-green)' : 'rgba(255,255,255,0.5)', textAlign: 'center', wordBreak: 'break-word' }}>
                                 {selectedFiles.length > 0 
                                    ? `Fichiers (${selectedFiles.length}) : ${selectedFiles.map(f => f.name).join(', ')}` 
                                    : "Sélectionner un ou plusieurs fichiers PDF..."}
                              </span>
                              <input 
                                 type="file" 
                                 accept=".pdf" 
                                 multiple
                                 onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))} 
                                 style={{ display: 'none' }} 
                              />
                           </label>
                        </div>
                     )}
                     
                     {importType === 'image' && (
                        <div>
                           <label style={{ display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', height: 'auto', minHeight: '48px', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: '12px', cursor: 'pointer', backgroundColor: 'rgba(255,255,255,0.01)', transition: 'border-color 0.2s', width: '100%', padding: '8px 12px', boxSizing: 'border-box' }}>
                              <span style={{ fontSize: '14px', color: selectedFiles.length > 0 ? 'var(--color-vivid-green)' : 'rgba(255,255,255,0.5)', textAlign: 'center', wordBreak: 'break-word' }}>
                                 {selectedFiles.length > 0 
                                    ? `Images (${selectedFiles.length}) : ${selectedFiles.map(f => f.name).join(', ')}` 
                                    : "Prendre ou sélectionner une ou plusieurs images..."}
                              </span>
                              <input 
                                 type="file" 
                                 accept="image/*" 
                                 multiple
                                 onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))} 
                                 style={{ display: 'none' }} 
                              />
                           </label>
                        </div>
                     )}

                     {importType === 'url' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                           <input 
                              type="url" 
                              className="action-input"
                              placeholder="URL de la page web (ex: https://example.com/article)..."
                              value={urlInput}
                              onChange={(e) => setUrlInput(e.target.value)}
                              disabled={addingUrl}
                              required
                              style={{ width: '100%', boxSizing: 'border-box' }}
                           />
                           <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <label style={{ fontSize: '12px', opacity: 0.6 }}>Profondeur de crawling :</label>
                              <select 
                                 className="action-input"
                                 value={crawlDepth}
                                 onChange={(e) => setCrawlDepth(parseInt(e.target.value))}
                                 style={{ width: '100%', boxSizing: 'border-box', backgroundColor: '#182030', color: '#fff', border: '1px solid rgba(255,255,255,0.08)' }}
                              >
                                 <option value={0}>Page principale uniquement (Profondeur 0)</option>
                                 <option value={1}>Page principale + Liens directs (Profondeur 1)</option>
                                 <option value={2}>Page principale + Liens directs + secondaires (Profondeur 2)</option>
                              </select>
                           </div>
                        </div>
                     )}

                     {importType === 'text' && (
                        <textarea 
                           className="action-input"
                           placeholder="Collez ici votre texte brut ou Markdown provenant d'une autre conversation LLM..."
                           value={markdownInput}
                           onChange={(e) => setMarkdownInput(e.target.value)}
                           disabled={uploading}
                           required
                           rows={8}
                           style={{ minHeight: '150px', resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
                        />
                     )}

                     {importType === 'audio' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center', justifyContent: 'center', padding: '16px 8px', width: '100%' }}>
                           {recording ? (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{
                                       width: '12px',
                                       height: '12px',
                                       borderRadius: '50%',
                                       backgroundColor: '#f43f5e',
                                       display: 'inline-block',
                                       animation: 'pulse 1.2s infinite alternate'
                                    }} />
                                    <span style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                                       {formatDuration(recordingSeconds)}
                                    </span>
                                 </div>
                                 <button 
                                    type="button"
                                    onClick={stopRecording}
                                    className="action-button btn-secondary"
                                    style={{
                                       borderColor: '#f43f5e',
                                       backgroundColor: 'rgba(244, 63, 94, 0.08)',
                                       color: '#f43f5e',
                                       height: '46px',
                                       padding: '0 24px',
                                       borderRadius: '14px'
                                    }}
                                 >
                                    <IconPlayerStop size={16} /> Arrêter l'enregistrement
                                 </button>
                              </div>
                           ) : audioUrl ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', alignItems: 'center' }}>
                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-vivid-green)' }}>
                                    <IconCircleCheck size={18} />
                                    <span style={{ fontSize: '13px', fontWeight: '600' }}>Enregistrement terminé</span>
                                 </div>
                                 <audio src={audioUrl} controls style={{ width: '100%', borderRadius: '8px' }} />
                                 <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                                    <button 
                                       type="button"
                                       onClick={startRecording}
                                       className="action-button btn-secondary"
                                       style={{ flex: 1, height: '40px', fontSize: '13px' }}
                                    >
                                       Recommencer
                                    </button>
                                    <button 
                                       type="button"
                                       onClick={() => {
                                          setAudioBlob(null);
                                          setAudioUrl('');
                                       }}
                                       className="action-button btn-secondary"
                                       style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', height: '40px', fontSize: '13px' }}
                                    >
                                       Effacer
                                    </button>
                                 </div>
                              </div>
                           ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', alignItems: 'center' }}>
                                 <button 
                                    type="button"
                                    onClick={startRecording}
                                    className="action-button"
                                    style={{
                                       backgroundColor: 'var(--color-vivid-red)',
                                       color: '#fff',
                                       height: '52px',
                                       borderRadius: '16px',
                                       padding: '0 24px',
                                       fontWeight: 'bold',
                                       width: '100%',
                                       display: 'flex',
                                       justifyContent: 'center',
                                       alignItems: 'center',
                                       gap: '8px',
                                       boxShadow: '0 4px 12px rgba(244, 63, 94, 0.3)'
                                    }}
                                 >
                                    <IconMicrophone size={20} /> Commencer l'enregistrement
                                 </button>
                                 
                                 <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', margin: '8px 0' }}>
                                    <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.06)' }} />
                                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>OU</span>
                                    <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.06)' }} />
                                 </div>

                                 <label style={{ display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', height: '42px', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: '12px', cursor: 'pointer', backgroundColor: 'rgba(255,255,255,0.01)', width: '100%', padding: '0 12px', boxSizing: 'border-box' }}>
                                    <span style={{ fontSize: '13px', color: selectedFiles.length > 0 ? 'var(--color-vivid-green)' : 'rgba(255,255,255,0.4)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                       {selectedFiles.length > 0 
                                          ? `Audio sélectionné : ${selectedFiles[0].name}` 
                                          : 'Sélectionner un fichier audio...'}
                                    </span>
                                    <input 
                                       type="file" 
                                       accept="audio/*" 
                                       onChange={(e) => {
                                          setSelectedFiles(Array.from(e.target.files || []));
                                          setAudioBlob(null);
                                          setAudioUrl('');
                                       }} 
                                       style={{ display: 'none' }} 
                                    />
                                 </label>
                              </div>
                           )}
                           
                           <style>{`
                              @keyframes pulse {
                                 from { opacity: 0.4; transform: scale(0.9); }
                                 to { opacity: 1; transform: scale(1.1); }
                              }
                           `}</style>
                        </div>
                     )}

                     <textarea 
                        className="action-input"
                        placeholder="Note de contexte (Optionnelle - ex: Pourquoi ce document est important, points clés à retenir...)"
                        value={contextNoteInput}
                        onChange={(e) => setContextNoteInput(e.target.value)}
                        disabled={uploading || addingUrl}
                        rows={3}
                        style={{ minHeight: '60px', resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
                     />

                     <button 
                        type="submit" 
                        className="action-button" 
                        disabled={uploading || addingUrl || recording || (importType === 'pdf' && selectedFiles.length === 0) || (importType === 'image' && selectedFiles.length === 0) || (importType === 'url' && !urlInput.trim()) || (importType === 'text' && !markdownInput.trim()) || (importType === 'audio' && !audioBlob && selectedFiles.length === 0)}
                        style={{ height: '48px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                     >
                        {(uploading || addingUrl) ? (
                           <IconLoader2 style={{ animation: 'spin 1s linear infinite' }} size={20} />
                        ) : (
                           "Importer et analyser avec l'IA"
                        )}
                     </button>
                  </form>
               </div>
            </div>
         )}

         {showQueueModal && (
            <div 
               style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(9, 13, 22, 0.85)',
                  backdropFilter: 'blur(12px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1000,
                  padding: '20px',
                  boxSizing: 'border-box'
               }}
               onClick={(e) => {
                  if (e.target === e.currentTarget) {
                     setShowQueueModal(false);
                  }
               }}
            >
               <div 
                  style={{
                     backgroundColor: '#131924',
                     padding: '24px',
                     borderRadius: '24px',
                     border: '1px solid rgba(255,255,255,0.08)',
                     maxWidth: '600px',
                     width: '100%',
                     maxHeight: '80vh',
                     boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
                     display: 'flex',
                     flexDirection: 'column',
                     gap: '16px',
                     position: 'relative'
                  }}
               >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <h3 style={{ fontSize: '18px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', margin: 0, color: 'var(--color-vivid-yellow)' }}>
                        <IconLoader2 size={20} style={{ animation: 'spin 1.5s linear infinite' }} />
                        File d'attente d'importation
                     </h3>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {queueTasks.some(t => t.status === 'failed') && (
                           <button
                              onClick={handleRetryAllFailedQueueTasks}
                              style={{
                                 display: 'flex',
                                 alignItems: 'center',
                                 gap: '6px',
                                 padding: '6px 12px',
                                 borderRadius: '8px',
                                 backgroundColor: 'rgba(59, 130, 246, 0.15)',
                                 border: '1px solid rgba(59, 130, 246, 0.3)',
                                 color: '#3b82f6',
                                 fontSize: '12px',
                                 fontWeight: '600',
                                 cursor: 'pointer'
                              }}
                              title="Relancer toutes les tâches en échec"
                           >
                              <IconRefresh size={14} />
                              Tout relancer
                           </button>
                        )}
                        {queueTasks.length > 0 && (
                           <button
                              onClick={handleClearAllQueueTasks}
                              style={{
                                 display: 'flex',
                                 alignItems: 'center',
                                 gap: '6px',
                                 padding: '6px 12px',
                                 borderRadius: '8px',
                                 backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                 border: '1px solid rgba(239, 68, 68, 0.3)',
                                 color: '#ef4444',
                                 fontSize: '12px',
                                 fontWeight: '600',
                                 cursor: 'pointer'
                              }}
                              title="Purger toutes les tâches de la file"
                           >
                              <IconTrash size={14} />
                              Vider la file
                           </button>
                        )}
                        <button 
                           onClick={() => setShowQueueModal(false)}
                           style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer', opacity: 0.6 }}
                        >
                           ✕
                        </button>
                     </div>
                  </div>

                  <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px' }}>
                     {queueTasks.filter(t => t.status === 'pending' || t.status === 'processing' || t.status === 'failed').length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '24px', color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>
                           Aucune tâche active dans la file d'attente.
                        </div>
                     ) : (
                        queueTasks
                           .filter(t => t.status === 'pending' || t.status === 'processing' || t.status === 'failed')
                           .map(task => (
                              <div 
                                 key={task.id} 
                                 style={{ 
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    gap: '8px', 
                                    padding: '16px', 
                                    borderRadius: '16px', 
                                    backgroundColor: 'rgba(255, 255, 255, 0.02)', 
                                    border: '1px solid rgba(255, 255, 255, 0.04)' 
                                 }}
                              >
                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                       {task.name || 'Tâche sans nom'}
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                       <span 
                                          className={`status-badge ${task.status === 'processing' ? 'status-optimal' : task.status === 'failed' ? 'status-critical' : 'status-nominal'}`} 
                                          style={{ fontSize: '11px', padding: '4px 10px', textTransform: 'capitalize' }}
                                       >
                                          {task.status === 'processing' ? 'Analyse...' : task.status === 'failed' ? 'Échec' : 'En attente'}
                                       </span>
                                       {task.status === 'failed' && (
                                          <button
                                             onClick={() => handleRetryQueueTask(task.id)}
                                             style={{
                                                background: 'none',
                                                border: 'none',
                                                color: '#38bdf8',
                                                cursor: 'pointer',
                                                padding: '4px',
                                                display: 'flex',
                                                alignItems: 'center'
                                             }}
                                             title="Réessayer"
                                          >
                                             <IconRefresh size={16} />
                                          </button>
                                       )}
                                       <button
                                          onClick={() => handleDeleteQueueTask(task.id)}
                                          style={{
                                             background: 'none',
                                             border: 'none',
                                             color: '#ef4444',
                                             cursor: 'pointer',
                                             padding: '4px',
                                             display: 'flex',
                                             alignItems: 'center',
                                             opacity: 0.8
                                          }}
                                          title="Supprimer la tâche"
                                       >
                                          <IconTrash size={16} />
                                       </button>
                                    </div>
                                 </div>
                                 
                                 {task.status === 'processing' && (
                                    <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden', marginTop: '4px' }}>
                                       <div style={{ width: `${task.progress || 0}%`, height: '100%', backgroundColor: 'var(--color-vivid-green)', transition: 'width 0.3s ease' }} />
                                    </div>
                                 )}

                                 {task.status === 'failed' && task.error && (
                                    <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px', backgroundColor: 'rgba(239, 68, 68, 0.08)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                                       <strong>Erreur :</strong> {task.error}
                                    </div>
                                 )}
                              </div>
                           ))
                     )}
                  </div>
               </div>
            </div>
         )}

         {showSkillsModal && (
            <div 
               style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(9, 13, 22, 0.85)',
                  backdropFilter: 'blur(12px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1000,
                  padding: '20px',
                  boxSizing: 'border-box'
               }}
               onClick={(e) => {
                  if (e.target === e.currentTarget) {
                     setShowSkillsModal(false);
                  }
               }}
            >
               <div 
                  style={{
                     backgroundColor: '#131924',
                     padding: '24px',
                     borderRadius: '24px',
                     border: '1px solid rgba(255,255,255,0.08)',
                     maxWidth: '680px',
                     width: '100%',
                     maxHeight: '85vh',
                     boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
                     display: 'flex',
                     flexDirection: 'column',
                     gap: '16px',
                     position: 'relative'
                  }}
               >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <h3 style={{ fontSize: '18px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', margin: 0, color: '#38bdf8' }}>
                        <IconPuzzle size={22} />
                        Extensions & Skills Agent
                     </h3>
                     <button 
                        onClick={() => setShowSkillsModal(false)}
                        style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer', opacity: 0.6 }}
                     >
                        ✕
                     </button>
                  </div>

                  <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: '1.4' }}>
                     Connectez vos services externes (Jellyfin, Wikipédia, Odoo...) pour permettre à l'assistant IA d'interagir en toute autonomie et d'enrichir votre Second Brain.
                  </p>

                   <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '4px' }}>
                      {skillsData?.skills?.map((skillItem: any) => {
                         const alias = skillItem.alias;
                         const manifest = skillItem.manifest || { id: alias, name: skillItem.name, description: skillItem.description, icon: '⚡', fields: [] };
                         const currentValues = skillFormValues[alias] || {};
                         const isConfigured = skillItem.configured;

                         return (
                            <div 
                               key={alias} 
                               style={{ 
                                  padding: '18px', 
                                  borderRadius: '16px', 
                                  backgroundColor: 'rgba(255,255,255,0.02)', 
                                  border: '1px solid rgba(255,255,255,0.08)', 
                                  display: 'flex', 
                                  flexDirection: 'column', 
                                  gap: '14px' 
                               }}
                            >
                               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                     <span style={{ fontSize: '22px' }}>{manifest.icon || '⚡'}</span>
                                     <div>
                                        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', color: '#fff' }}>{manifest.name}</h4>
                                        <p style={{ margin: 0, fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>{manifest.description}</p>
                                     </div>
                                  </div>
                                  <span className={`status-badge ${isConfigured ? 'status-optimal' : 'status-nominal'}`} style={{ fontSize: '11px', padding: '3px 10px' }}>
                                     {isConfigured ? '🟢 Connecté / Actif' : '⚪ Non configuré'}
                                  </span>
                               </div>

                               {manifest.fields && manifest.fields.length > 0 && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                                     <div style={{ display: 'grid', gridTemplateColumns: manifest.fields.length > 1 ? '1fr 1fr' : '1fr', gap: '10px' }}>
                                        {manifest.fields.map((field: any) => (
                                           <div key={field.name} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                 <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>
                                                    {field.label} {field.required && <span style={{ color: '#ef4444' }}>*</span>}
                                                 </label>
                                                 {alias === 'jellyfin' && field.name === 'libraryName' && (
                                                    <button
                                                       type="button"
                                                       onClick={handleDetectJellyfinLibraries}
                                                       disabled={isDetectingLibraries}
                                                       style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                    >
                                                       <IconRefresh size={12} style={{ animation: isDetectingLibraries ? 'spin 1.5s linear infinite' : 'none' }} />
                                                       {isDetectingLibraries ? 'Détection...' : 'Détecter mes dossiers'}
                                                    </button>
                                                 )}
                                              </div>

                                              {field.type === 'select' ? (
                                                 <select
                                                    value={currentValues[field.name] || ''}
                                                    onChange={(e) => handleFieldChange(alias, field.name, e.target.value)}
                                                    style={{ height: '36px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '0 10px', fontSize: '13px' }}
                                                 >
                                                    <option value="">Sélectionnez...</option>
                                                    {field.options?.map((opt: any) => (
                                                       <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                    ))}
                                                 </select>
                                              ) : (
                                                 <input 
                                                    type={field.type || 'text'}
                                                    value={currentValues[field.name] || ''}
                                                    onChange={(e) => handleFieldChange(alias, field.name, e.target.value)}
                                                    placeholder={field.placeholder || ''}
                                                    style={{ height: '36px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '0 10px', fontSize: '13px' }}
                                                 />
                                              )}
                                              {field.description && (
                                                 <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{field.description}</span>
                                              )}
                                           </div>
                                        ))}
                                     </div>

                                     {alias === 'jellyfin' && jellyfinLibraries.length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', backgroundColor: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '8px' }}>
                                           <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', width: '100%', marginBottom: '2px' }}>Dossiers détectés (cliquez pour sélectionner) :</span>
                                           {jellyfinLibraries.map(lib => (
                                              <button
                                                 key={lib.id}
                                                 type="button"
                                                 onClick={() => handleFieldChange('jellyfin', 'libraryName', lib.name)}
                                                 style={{
                                                    padding: '4px 10px',
                                                    borderRadius: '6px',
                                                    backgroundColor: currentValues['libraryName'] === lib.name ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255,255,255,0.08)',
                                                    border: currentValues['libraryName'] === lib.name ? '1px solid #38bdf8' : '1px solid transparent',
                                                    color: currentValues['libraryName'] === lib.name ? '#38bdf8' : '#fff',
                                                    fontSize: '12px',
                                                    cursor: 'pointer'
                                                 }}
                                              >
                                                 📁 {lib.name}
                                              </button>
                                           ))}
                                        </div>
                                     )}

                                     <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                                        <button
                                           type="button"
                                           onClick={() => handleTestSkill(alias)}
                                           disabled={testingSkillAlias === alias}
                                           style={{
                                              flex: 1,
                                              height: '38px',
                                              borderRadius: '8px',
                                              backgroundColor: 'rgba(59, 130, 246, 0.15)',
                                              border: '1px solid rgba(59, 130, 246, 0.3)',
                                              color: '#3b82f6',
                                              fontSize: '12px',
                                              fontWeight: '600',
                                              cursor: 'pointer',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              gap: '6px'
                                           }}
                                        >
                                           <IconRefresh size={14} style={{ animation: testingSkillAlias === alias ? 'spin 1.5s linear infinite' : 'none' }} />
                                           {testingSkillAlias === alias ? 'Test en cours...' : 'Tester la connexion'}
                                        </button>
                                        <button
                                           type="button"
                                           onClick={() => handleSaveSkillConfig(alias)}
                                           style={{
                                              flex: 1,
                                              height: '38px',
                                              borderRadius: '8px',
                                              backgroundColor: 'rgba(34, 197, 94, 0.15)',
                                              border: '1px solid rgba(34, 197, 94, 0.3)',
                                              color: '#22c55e',
                                              fontSize: '12px',
                                              fontWeight: '600',
                                              cursor: 'pointer'
                                           }}
                                        >
                                           💾 Enregistrer
                                        </button>
                                     </div>
                                  </div>
                               )}
                            </div>
                         );
                      })}
                   </div>
               </div>
            </div>
         )}

          {showLlmModal && (
             <div 
                style={{
                   position: 'fixed',
                   top: 0,
                   left: 0,
                   right: 0,
                   bottom: 0,
                   backgroundColor: 'rgba(9, 13, 22, 0.85)',
                   backdropFilter: 'blur(12px)',
                   display: 'flex',
                   alignItems: 'center',
                   justifyContent: 'center',
                   zIndex: 1000,
                   padding: '20px',
                   boxSizing: 'border-box'
                }}
                onClick={(e) => {
                   if (e.target === e.currentTarget) {
                      setShowLlmModal(false);
                   }
                }}
             >
                <div 
                   style={{
                      backgroundColor: '#131924',
                      padding: '24px',
                      borderRadius: '24px',
                      border: '1px solid rgba(59, 130, 246, 0.25)',
                      maxWidth: '480px',
                      width: '100%',
                      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '18px',
                      position: 'relative'
                   }}
                >
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                         <IconSparkles size={22} style={{ color: '#3b82f6' }} />
                         <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff', margin: 0 }}>Moteur IA & LLM</h3>
                      </div>
                      <button 
                         onClick={() => setShowLlmModal(false)}
                         style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer', opacity: 0.6 }}
                      >
                         ✕
                      </button>
                   </div>

                   <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.4', margin: 0 }}>
                      Sélectionnez et configurez le modèle de langage (LLM) utilisé par Modaka pour l'intelligence, la synthèse et le chat.
                   </p>

                   <form 
                      onSubmit={(e) => {
                         e.preventDefault();
                         handleSaveLlmConfig();
                      }}
                      style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
                   >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                         <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>Fournisseur IA :</label>
                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <button
                               type="button"
                               onClick={() => setModalLlmProvider('gemini')}
                               style={{
                                  padding: '12px',
                                  borderRadius: '12px',
                                  backgroundColor: modalLlmProvider === 'gemini' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.04)',
                                  border: modalLlmProvider === 'gemini' ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.08)',
                                  color: modalLlmProvider === 'gemini' ? '#60a5fa' : '#fff',
                                  fontWeight: '600',
                                  fontSize: '13px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '8px'
                               }}
                            >
                               ⚡ Google Gemini
                            </button>
                            <button
                               type="button"
                               onClick={() => setModalLlmProvider('llama')}
                               style={{
                                  padding: '12px',
                                  borderRadius: '12px',
                                  backgroundColor: modalLlmProvider === 'llama' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.04)',
                                  border: modalLlmProvider === 'llama' ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.08)',
                                  color: modalLlmProvider === 'llama' ? '#34d399' : '#fff',
                                  fontWeight: '600',
                                  fontSize: '13px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '8px'
                               }}
                            >
                               🦙 LLM Local (Ollama / Llama.cpp)
                            </button>
                         </div>
                      </div>

                      {modalLlmProvider === 'gemini' ? (
                         <>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                               <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>Clé API Google Gemini (AI Studio) :</label>
                               <div style={{ display: 'flex', gap: '8px' }}>
                                  <input 
                                     type="password" 
                                     className="action-input-sm"
                                     value={modalLlmApiKey}
                                     onChange={(e) => {
                                        setModalLlmApiKey(e.target.value);
                                        setLlmTestStatusInModal(null);
                                     }}
                                     placeholder="AIzaSy..."
                                     style={{ flex: 1, boxSizing: 'border-box' }}
                                  />
                                  <button
                                     type="button"
                                     onClick={handleTestLlmInModal}
                                     disabled={isTestingLlmInModal}
                                     style={{
                                        backgroundColor: 'rgba(59, 130, 246, 0.2)',
                                        border: '1px solid rgba(59, 130, 246, 0.4)',
                                        color: '#60a5fa',
                                        borderRadius: '10px',
                                        padding: '0 14px',
                                        fontSize: '12px',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                     }}
                                  >
                                     {isTestingLlmInModal ? <IconLoader2 size={14} style={{ animation: 'spin 1.5s linear infinite' }} /> : 'Tester'}
                                  </button>
                               </div>
                               {llmTestStatusInModal && (
                                  <span style={{ fontSize: '12px', color: llmTestStatusInModal.success ? 'var(--color-vivid-green)' : '#f87171', fontWeight: '500', marginTop: '2px' }}>
                                     {llmTestStatusInModal.success ? '🟢 ' : '🔴 '}{llmTestStatusInModal.message}
                                  </span>
                               )}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                               <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>Modèle Gemini :</label>
                               <select 
                                  className="action-input-sm"
                                  value={modalLlmModel}
                                  onChange={(e) => setModalLlmModel(e.target.value)}
                                  style={{ width: '100%', boxSizing: 'border-box', backgroundColor: '#182030', color: '#fff', border: '1px solid rgba(255,255,255,0.08)' }}
                               >
                                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (Recommandé - Ultra Rapide) ⚡</option>
                                  <option value="gemini-2.5-pro">Gemini 2.5 Pro (Raisonnement Avancé) 🧠</option>
                                  <option value="gemini-1.5-flash">Gemini 1.5 Flash ⚡</option>
                                  <option value="gemini-1.5-pro">Gemini 1.5 Pro 🧠</option>
                               </select>
                            </div>
                         </>
                      ) : (
                         <>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                               <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>Endpoint Local (Ollama / Llama.cpp) :</label>
                               <div style={{ display: 'flex', gap: '8px' }}>
                                  <input 
                                     type="text" 
                                     className="action-input-sm"
                                     value={modalLlamaEndpoint}
                                     onChange={(e) => {
                                        setModalLlamaEndpoint(e.target.value);
                                        setLlmTestStatusInModal(null);
                                     }}
                                     placeholder="http://localhost:11434"
                                     style={{ flex: 1, boxSizing: 'border-box' }}
                                  />
                                  <button
                                     type="button"
                                     onClick={handleTestLlmInModal}
                                     disabled={isTestingLlmInModal}
                                     style={{
                                        backgroundColor: 'rgba(16, 185, 129, 0.2)',
                                        border: '1px solid rgba(16, 185, 129, 0.4)',
                                        color: '#34d399',
                                        borderRadius: '10px',
                                        padding: '0 14px',
                                        fontSize: '12px',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                     }}
                                  >
                                     {isTestingLlmInModal ? <IconLoader2 size={14} style={{ animation: 'spin 1.5s linear infinite' }} /> : 'Tester'}
                                  </button>
                               </div>
                               {llmTestStatusInModal && (
                                  <span style={{ fontSize: '12px', color: llmTestStatusInModal.success ? 'var(--color-vivid-green)' : '#f87171', fontWeight: '500', marginTop: '2px' }}>
                                     {llmTestStatusInModal.success ? '🟢 ' : '🔴 '}{llmTestStatusInModal.message}
                                  </span>
                               )}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                               <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>Nom du Modèle Local :</label>
                               <input 
                                  type="text" 
                                  className="action-input-sm"
                                  value={modalLlmModel}
                                  onChange={(e) => setModalLlmModel(e.target.value)}
                                  placeholder="llama3, mistral, qwen2..."
                                  style={{ width: '100%', boxSizing: 'border-box' }}
                               />
                            </div>
                         </>
                      )}

                      <button 
                         type="submit" 
                         className="action-button" 
                         style={{ height: '48px', fontWeight: '600', marginTop: '6px', cursor: 'pointer' }}
                      >
                         Enregistrer la configuration IA
                      </button>
                   </form>
                </div>
             </div>
          )}

         {showProfileModal && (
            <div 
               style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(9, 13, 22, 0.85)',
                  backdropFilter: 'blur(12px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1000,
                  padding: '20px',
                  boxSizing: 'border-box'
               }}
               onClick={(e) => {
                  if (e.target === e.currentTarget) {
                     setShowProfileModal(false);
                  }
               }}
            >
               <div 
                  style={{
                     backgroundColor: '#131924',
                     padding: '24px',
                     borderRadius: '24px',
                     border: '1px solid rgba(255,255,255,0.08)',
                     maxWidth: '450px',
                     width: '100%',
                     boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
                     display: 'flex',
                     flexDirection: 'column',
                     gap: '18px',
                     position: 'relative'
                  }}
               >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <IconUser size={20} style={{ color: 'var(--color-vivid-green)' }} />
                        <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>Profil & Préférences</h3>
                     </div>
                     <button 
                        onClick={() => setShowProfileModal(false)}
                        style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer', opacity: 0.6 }}
                     >
                        ✕
                     </button>
                  </div>

                  <form 
                     onSubmit={(e) => {
                        e.preventDefault();
                        handleSaveProfile({
                           name: modalName,
                           email: modalEmail,
                           language: modalLanguage,
                           ttsProvider: modalTtsProvider,
                           elevenLabsApiKey: modalElevenLabsApiKey,
                           elevenLabsVoiceId: modalElevenLabsVoiceId
                        });
                     }}
                     style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
                  >
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>Nom de l'utilisateur :</label>
                        <input 
                           type="text" 
                           name="name"
                           className="action-input-sm"
                           value={modalName}
                           onChange={(e) => setModalName(e.target.value)}
                           required
                           style={{ width: '100%', boxSizing: 'border-box' }}
                        />
                     </div>

                     <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>Adresse email (facultatif) :</label>
                        <input 
                           type="email" 
                           name="email"
                           className="action-input-sm"
                           value={modalEmail}
                           onChange={(e) => setModalEmail(e.target.value)}
                           style={{ width: '100%', boxSizing: 'border-box' }}
                        />
                     </div>

                     <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>Langue de communication :</label>
                        <select 
                           name="language"
                           className="action-input-sm"
                           value={modalLanguage}
                           onChange={(e) => setModalLanguage(e.target.value)}
                           style={{ width: '100%', boxSizing: 'border-box', backgroundColor: '#182030', color: '#fff', border: '1px solid rgba(255,255,255,0.08)' }}
                        >
                           <option value="fr_FR">Français 🇫🇷</option>
                           <option value="en_US">English 🇬🇧</option>
                           <option value="es_ES">Español 🇪🇸</option>
                           <option value="de_DE">Deutsch 🇩🇪</option>
                           <option value="it_IT">Italiano 🇮🇹</option>
                        </select>
                     </div>

                     <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>Moteur de synthèse vocale (TTS) :</label>
                        <select 
                           name="ttsProvider"
                           className="action-input-sm"
                           value={modalTtsProvider}
                           onChange={(e) => setModalTtsProvider(e.target.value)}
                           style={{ width: '100%', boxSizing: 'border-box', backgroundColor: '#182030', color: '#fff', border: '1px solid rgba(255,255,255,0.08)' }}
                        >
                           <option value="Browser">Navigateur (Natif / Gratuit) 🖥️</option>
                           <option value="ElevenLabs">ElevenLabs (Premium / Haute qualité) 🎙️</option>
                        </select>
                     </div>

                     {modalTtsProvider === 'ElevenLabs' && (
                        <>
                           <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>Clé API ElevenLabs :</label>
                              <input 
                                 type="password" 
                                 name="elevenLabsApiKey"
                                 className="action-input-sm"
                                 value={modalElevenLabsApiKey}
                                 onChange={(e) => setModalElevenLabsApiKey(e.target.value)}
                                 placeholder="Saisissez votre xi-api-key..."
                                 required
                                 style={{ width: '100%', boxSizing: 'border-box' }}
                              />
                           </div>
                           <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>ID de la Voix ElevenLabs :</label>
                              <input 
                                 type="text" 
                                 name="elevenLabsVoiceId"
                                 className="action-input-sm"
                                 value={modalElevenLabsVoiceId}
                                 onChange={(e) => setModalElevenLabsVoiceId(e.target.value)}
                                 placeholder="Saisissez l'ID de votre voix (ex: bVsJfghVbJypxgwVISO3)..."
                                 required
                                 style={{ width: '100%', boxSizing: 'border-box' }}
                              />
                           </div>
                        </>
                     )}

                     <div 
                        style={{ 
                           display: 'flex', 
                           alignItems: 'center', 
                           justifyContent: 'space-between', 
                           padding: '12px 16px', 
                           borderRadius: '12px', 
                           backgroundColor: 'rgba(255,255,255,0.02)', 
                           border: '1px solid rgba(255,255,255,0.06)',
                           marginTop: '4px',
                           cursor: 'pointer',
                           userSelect: 'none'
                        }}
                        onClick={() => {
                           const next = !devMode;
                           setDevMode(next);
                           document.cookie = `sb_dev_mode=${next}; path=/; max-age=31536000; SameSite=Lax`;
                           if (!next) setShowRawViewer(false);
                        }}
                     >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                           <span style={{ fontSize: '14px', fontWeight: '600', color: '#fff' }}>Mode Développeur</span>
                           <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>Affiche les performances d'I/O et de l'IA</span>
                        </div>
                        <div 
                           style={{
                              width: '40px',
                              height: '22px',
                              borderRadius: '11px',
                              backgroundColor: devMode ? 'var(--color-vivid-green)' : 'rgba(255,255,255,0.08)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              position: 'relative',
                              display: 'flex',
                              alignItems: 'center',
                              padding: '2px',
                              boxSizing: 'border-box',
                              transition: 'background-color 0.2s'
                           }}
                        >
                           <div 
                              style={{
                                 width: '16px',
                                 height: '16px',
                                 borderRadius: '50%',
                                 backgroundColor: '#ffffff',
                                 boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                 transform: devMode ? 'translateX(18px)' : 'translateX(0)',
                                 transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                              }}
                           />
                        </div>
                     </div>

                     <button 
                        type="button" 
                        className="action-button btn-secondary" 
                        onClick={() => {
                           setShowExportConfig(!showExportConfig);
                        }}
                        style={{ height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', border: '1px dashed rgba(255,255,255,0.2)', cursor: 'pointer' }}
                     >
                        Exporter ma configuration (QR Code)
                     </button>

                     {showExportConfig && qrCodeDataUrl && (
                        <div 
                           onClick={() => {
                              setQrModalZoomed(false);
                              setShowQrModal(true);
                           }}
                           style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '16px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', cursor: 'zoom-in' }}
                           title="Cliquez pour agrandir"
                        >
                           <div style={{ backgroundColor: 'white', padding: '8px', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <img src={qrCodeDataUrl} alt="Export QR Code" style={{ width: '150px', height: '150px' }} />
                              <span style={{ fontSize: '10px', color: '#666', marginTop: '4px', fontWeight: '500' }}>
                                 🔍 Cliquez pour agrandir
                              </span>
                           </div>
                           <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                              Scannez ce QR Code depuis un autre téléphone lors de l'installation pour transférer instantanément votre profil et vos stockages.
                           </span>
                        </div>
                     )}

                     <button 
                        type="submit" 
                        className="action-button" 
                        style={{ height: '48px', fontWeight: '600', marginTop: '10px', cursor: 'pointer' }}
                     >
                        Enregistrer les préférences
                     </button>
                  </form>
               </div>
            </div>
         )}
          </main>
           )}
           {configured && (
              <nav className="bottom-nav">
                <button 
                   className={`nav-item ${activeTab === 'chat' ? 'active' : ''}`}
                   onClick={() => setActiveTab('chat')}
                   style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                >
                   <IconMessage size={28} />
                   <span style={{ marginTop: '4px' }}>{AppConfig.name}</span>
                </button>
                <button 
                   className={`nav-item ${activeTab === 'docs' ? 'active' : ''}`}
                   onClick={() => setActiveTab('docs')}
                   style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                >
                   <IconFileText size={28} />
                   <span style={{ marginTop: '4px' }}>Documents</span>
                </button>
                <button 
                   className={`nav-item ${activeTab === 'stats' ? 'active' : ''}`}
                   onClick={() => setActiveTab('stats')}
                   style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                >
                   <IconFolder size={28} />
                   <span style={{ marginTop: '4px' }}>Stats & Export</span>
                </button>
             </nav>
          )}
          
          <style>{`
             @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
             }
          `}</style>
          {docToDelete && (
             <div 
                style={{
                   position: 'fixed',
                   top: 0,
                   left: 0,
                   right: 0,
                   bottom: 0,
                   backgroundColor: 'rgba(9, 13, 22, 0.85)',
                   backdropFilter: 'blur(12px)',
                   display: 'flex',
                   alignItems: 'center',
                   justifyContent: 'center',
                   zIndex: 1100,
                   padding: '20px',
                   boxSizing: 'border-box'
                }}
             >
                <div 
                   style={{
                      backgroundColor: '#131924',
                      padding: '24px',
                      borderRadius: '24px',
                      border: '1px solid rgba(255,255,255,0.08)',
                      maxWidth: '400px',
                      width: '100%',
                      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '16px',
                      textAlign: 'center'
                   }}
                >
                   <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: '#ffffff' }}>Supprimer le document</h3>
                   <p style={{ fontSize: '14px', opacity: 0.8, margin: 0, lineHeight: '1.5', color: 'rgba(255,255,255,0.8)' }}>
                      Êtes-vous sûr de vouloir supprimer définitivement le document <strong>"{docToDelete.title}"</strong> ? Cette action est irréversible.
                   </p>
                   <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                      <button 
                         onClick={() => setDocToDelete(null)}
                         className="action-button btn-secondary"
                         style={{ flex: 1, height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                         Annuler
                      </button>
                      <button 
                         onClick={async () => {
                            const id = docToDelete.id;
                            setDocToDelete(null);
                            await executeDeleteDoc(id);
                         }}
                         className="action-button"
                         style={{ flex: 1, height: '44px', backgroundColor: '#ef4444', border: 'none', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '600' }}
                      >
                         Supprimer
                      </button>
                   </div>
                </div>
             </div>
          )}

          {showCategoryModal && (
             <div 
                style={{
                   position: 'fixed',
                   top: 0,
                   left: 0,
                   right: 0,
                   bottom: 0,
                   backgroundColor: 'rgba(9, 13, 22, 0.85)',
                   backdropFilter: 'blur(12px)',
                   display: 'flex',
                   alignItems: 'center',
                   justifyContent: 'center',
                   zIndex: 1000,
                   padding: '20px',
                   boxSizing: 'border-box'
                }}
                onClick={(e) => {
                   if (e.target === e.currentTarget) {
                      setShowCategoryModal(false);
                   }
                }}
             >
                <div 
                   style={{
                      backgroundColor: '#131924',
                      padding: '24px',
                      borderRadius: '24px',
                      border: '1px solid rgba(255,255,255,0.08)',
                      maxWidth: '500px',
                      width: '100%',
                      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '18px',
                      maxHeight: '80vh'
                   }}
                >
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                         <span style={{ fontSize: '20px' }}>📁</span>
                         <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>Filtrer par catégorie</h3>
                      </div>
                      <button 
                         onClick={() => setShowCategoryModal(false)}
                         style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer', opacity: 0.6 }}
                      >
                         ✕
                      </button>
                   </div>

                   <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                      {['all', ...Array.from(new Set(documents.map(d => d.category).filter(Boolean) as string[]))].map(cat => (
                         <button 
                            key={cat}
                            onClick={() => {
                               setCategoryFilter(cat);
                               setShowCategoryModal(false);
                            }}
                            className={`action-button ${categoryFilter === cat ? 'btn-optimal' : 'btn-secondary'}`}
                            style={{ 
                               justifyContent: 'flex-start', 
                               height: '42px', 
                               fontSize: '14px', 
                               padding: '0 16px',
                               backgroundColor: categoryFilter === cat ? 'var(--color-vivid-green)' : 'rgba(255,255,255,0.02)',
                               color: categoryFilter === cat ? '#000' : '#fff',
                               border: '1px solid rgba(255,255,255,0.05)'
                            }}
                         >
                            {cat === 'all' ? '📁 Toutes les catégories' : `📁 ${cat}`}
                         </button>
                      ))}
                   </div>
                </div>
             </div>
          )}


          {showQrModal && (
             <div 
                onClick={() => setShowQrModal(false)}
                style={{
                   position: 'fixed',
                   top: 0,
                   left: 0,
                   right: 0,
                   bottom: 0,
                   backgroundColor: 'rgba(0,0,0,0.85)',
                   backdropFilter: 'blur(8px)',
                   zIndex: 3000,
                   display: 'flex',
                   flexDirection: 'column',
                   alignItems: 'center',
                   justifyContent: 'center',
                   padding: '24px',
                   cursor: 'pointer'
                }}
             >
                <div 
                   onClick={(e) => e.stopPropagation()}
                   style={{
                      backgroundColor: '#111827',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '20px',
                      padding: '24px',
                      width: '100%',
                      maxWidth: '400px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '16px',
                      boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
                      textAlign: 'center'
                   }}
                >
                   <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: 'white', margin: 0 }}>QR Code de Configuration</h3>
                   <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', margin: 0 }}>
                      Scannez ce QR Code pour importer instantanément votre profil et vos stockages.
                   </p>

                   <div 
                      onClick={() => setQrModalZoomed(!qrModalZoomed)}
                      style={{ 
                         backgroundColor: 'white', 
                         padding: '12px', 
                         borderRadius: '16px',
                         cursor: 'zoom-in',
                         transition: 'transform 0.2s ease',
                         transform: qrModalZoomed ? 'scale(1.15)' : 'scale(1)',
                         boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)',
                         display: 'flex',
                         alignItems: 'center',
                         justifyContent: 'center'
                      }}
                      title="Cliquez pour zoomer"
                   >
                      <img 
                         src={qrCodeDataUrl} 
                         alt="Zoomed QR Code" 
                         style={{ 
                            width: qrModalZoomed ? '360px' : '260px', 
                            height: qrModalZoomed ? '360px' : '260px',
                            transition: 'width 0.2s ease, height 0.2s ease'
                         }} 
                      />
                   </div>

                   <span style={{ fontSize: '11px', color: 'var(--color-vivid-green)', fontWeight: '500' }}>
                      {qrModalZoomed ? "🔍 Cliquez pour réduire" : "🔍 Cliquez sur le QR Code pour l'agrandir"}
                   </span>

                   <button 
                      type="button"
                      onClick={() => setShowQrModal(false)}
                      className="action-button btn-secondary"
                      style={{ width: '100%', height: '42px', marginTop: '8px', cursor: 'pointer' }}
                   >
                      Fermer
                   </button>
                </div>
             </div>
           )}
           </>
           )}
        </div>
     );
  }