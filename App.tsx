
import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  Sparkles,
  Loader2,
  Clock,
  Users,
  Flame,
  ArrowLeft,
  Home,
  User,
  Bookmark,
  Settings2,
  CheckCircle2,
  Plus,
  Camera,
  Share2,
  Minus,
  X,
  Mail,
  UserCircle,
  LogOut,
  ChevronRight,
  Coffee as CoffeeIcon,
  Cake,
  GlassWater,
  History,
  AlertCircle,
  Lock,
  Info,
  RefreshCcw,
  Image as ImageIcon
} from 'lucide-react';
import { analyzeInput, generateStepIllustration, generateHeroImage } from './geminiService';
import { RecipeData, IllustrationState, UserProfile, DiaryEntry, ProficiencyLevel } from './types';
import { supabase } from './supabaseClient';

const compressImage = (base64Str: string, maxWidth = 800, maxHeight = 800): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height;
          height = maxHeight;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve(base64Str);
  });
};

type Category = 'Dessert' | 'Beverage' | 'Coffee';

const SUGGESTIONS: Record<Category, string[]> = {
  Dessert: ['Chocolate Lava Cake', 'Strawberry Macarons', 'Matcha Cheesecake', 'Tiramisu'],
  Beverage: ['Iced Hibiscus Tea', 'Mango Lassi', 'Sparkling Lemonade', 'Berry Smoothie'],
  Coffee: ['Caramel Macchiato', 'Vanilla Latte', 'Dalgona Coffee', 'Affogato']
};

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'saved' | 'profile' | 'recipe' | 'history'>('home');
  const [activeCategory, setActiveCategory] = useState<Category>('Dessert');
  const [inputText, setInputText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [requestedServings, setRequestedServings] = useState(2);
  const [selectedSize, setSelectedSize] = useState('12oz');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [recipe, setRecipe] = useState<RecipeData | null>(null);
  const [heroImage, setHeroImage] = useState<string | null>(null);
  const [isHeroLoading, setIsHeroLoading] = useState(false);
  const [illustrations, setIllustrations] = useState<IllustrationState>({});
  
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authForm, setAuthForm] = useState({ username: '', email: '', password: '' });
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [showResend, setShowResend] = useState(false);
  const [authCooldown, setAuthCooldown] = useState(0);
  
  const [showPostFlow, setShowPostFlow] = useState(false);
  const [postImage, setPostImage] = useState<string | null>(null);
  const [postCaption, setPostCaption] = useState('');
  const [isPosting, setIsPosting] = useState(false);

  const [savedRecipes, setSavedRecipes] = useState<RecipeData[]>([]);
  const [searchHistory, setSearchHistory] = useState<any[]>([]);
  const [profile, setProfile] = useState<UserProfile>({
    avatar: null,
    levels: { dessert: 'Beginner', beverage: 'Beginner', coffee: 'Beginner' },
    diaries: []
  });

  const avatarFileRef = useRef<HTMLInputElement>(null);
  const postFileRef = useRef<HTMLInputElement>(null);

  const logSupabaseError = (context: string, error: any) => {
    if (!error) return;
    console.error(`[Supabase Error] ${context}:`, error);
  };

  useEffect(() => {
    let timer: any;
    if (authCooldown > 0) {
      timer = setInterval(() => {
        setAuthCooldown(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [authCooldown]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        setAuthForm(prev => ({ 
          ...prev,
          username: session.user.user_metadata.username || session.user.email?.split('@')[0] || '', 
          email: session.user.email || '' 
        }));
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        setAuthForm(prev => ({ 
          ...prev,
          username: session.user.user_metadata.username || session.user.email?.split('@')[0] || '', 
          email: session.user.email || '' 
        }));
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const syncProfile = async (userId: string, updates: any) => {
    try {
      const { error: syncError } = await supabase.from('profiles').upsert({ id: userId, ...updates }, { onConflict: 'id' });
      if (syncError) logSupabaseError("Sync Profile", syncError);
    } catch (err: any) {
      console.error("Sync Profile Exception:", err.message);
    }
  };

  useEffect(() => {
    if (!session?.user) return;

    const fetchData = async () => {
      const userId = session.user.id;
      try {
        const { data: profileData, error: profError } = await supabase.from('profiles').select('*').eq('id', userId).single();
        if (profError && profError.code !== 'PGRST116') logSupabaseError("Profile Fetch", profError);
        
        if (profileData) {
          setProfile(prev => ({ 
            ...prev, 
            avatar: profileData.avatar, 
            levels: profileData.levels || prev.levels 
          }));
        } else {
          await syncProfile(userId, { 
            username: authForm.username || session.user.user_metadata.username, 
            email: authForm.email || session.user.email, 
            levels: profile.levels 
          });
        }

        const { data: savedData, error: saveErr } = await supabase.from('saved_recipes').select('*').eq('user_id', userId);
        if (saveErr) logSupabaseError("Saved Fetch", saveErr);
        if (savedData) setSavedRecipes(savedData.map(d => d.recipe_data));

        const { data: historyData, error: histErr } = await supabase.from('search_history').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(10);
        if (histErr) logSupabaseError("History Fetch", histErr);
        if (historyData) setSearchHistory(historyData);

        const { data: diaryData, error: diaryErr } = await supabase.from('diaries').select('*').eq('user_id', userId).order('date', { ascending: false });
        if (diaryErr) logSupabaseError("Diary Fetch", diaryErr);
        if (diaryData) setProfile(prev => ({ ...prev, diaries: diaryData as DiaryEntry[] }));

      } catch (err: any) {
        console.warn("Supabase fetch exception:", err?.message);
      }
    };
    fetchData();
  }, [session]);

  const handleResendLink = async () => {
    if (!authForm.email) return;
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: authForm.email,
      });
      if (error) {
        if (error.status === 429) {
          setAuthError("Too many requests. Please wait a minute.");
          setAuthCooldown(60);
        } else {
          setAuthError(error.message);
        }
      } else {
        setAuthMessage("Confirmation email resent! Please check your spam folder.");
        setAuthCooldown(60);
      }
    } catch (err) {
      setAuthError("Failed to resend email.");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleAuth = async () => {
    const { email, password, username } = authForm;

    if (!email || !password || (authMode === 'signup' && !username)) {
      setAuthError("Please fill in all required fields.");
      return;
    }

    if (password.length < 6) {
      setAuthError("Password must be at least 6 characters long.");
      return;
    }

    setAuthError(null);
    setAuthMessage(null);
    setShowResend(false);
    setIsAuthLoading(true);

    try {
      if (authMode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          logSupabaseError("Sign In", error);
          if (error.message.toLowerCase().includes("confirmed")) {
            setAuthError("Your email is not confirmed. Please check your inbox or resend the link.");
            setShowResend(true);
          } else {
            setAuthError(error.message);
          }
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username }
          }
        });

        if (error) {
          logSupabaseError("Sign Up", error);
          if (error.status === 429) {
            setAuthError("Email rate limit reached. Please wait a moment.");
            setAuthCooldown(60);
          } else {
            setAuthError(error.message);
          }
        } else if (data.user && !data.session) {
          setAuthMessage("Success! Check your email inbox (and spam folder) for the confirmation link.");
          setShowResend(true);
          setAuthCooldown(30);
        } else if (data.user && data.session) {
          setAuthMessage("Welcome to SweetSpot!");
        }
      }
    } catch (err: any) {
      setAuthError("An unexpected error occurred. Please try again.");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setActiveTab('home');
    setRecipe(null);
  };

  useEffect(() => {
    if (recipe) {
      setActiveTab('recipe');
      if (!previewUrl) handleFetchHero(recipe.itemName);
      else setHeroImage(previewUrl);
      recipe.steps.forEach(step => {
        if (!illustrations[step.stepNumber]?.url && !illustrations[step.stepNumber]?.loading) {
          fetchIllustration(step.stepNumber, step.imagePrompt);
        }
      });
    }
  }, [recipe]);

  const handleFetchHero = async (itemName: string) => {
    setIsHeroLoading(true);
    setHeroImage(null);
    try {
      const img = await generateHeroImage(itemName);
      setHeroImage(img);
    } catch (err) {
      console.error("Hero generation failed:", err);
    } finally {
      setIsHeroLoading(false);
    }
  };

  const fetchIllustration = async (stepNumber: number, prompt: string) => {
    setIllustrations(prev => ({
      ...prev,
      [stepNumber]: { ...prev[stepNumber], loading: true, error: null }
    }));
    try {
      const imageUrl = await generateStepIllustration(prompt);
      setIllustrations(prev => ({
        ...prev,
        [stepNumber]: { url: imageUrl, loading: false, error: null }
      }));
    } catch (err) {
      setIllustrations(prev => ({
        ...prev,
        [stepNumber]: { ...prev[stepNumber], loading: false, error: "Retrying..." }
      }));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setInputText('');
    }
  };

  const handlePostImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        setPostImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const startAnalysis = async (customText?: string) => {
    const queryText = customText || inputText;
    if (!queryText && !selectedFile) return;
    setIsAnalyzing(true);
    setRecipe(null);
    setIllustrations({});
    try {
      const text = queryText.toLowerCase();
      let p: ProficiencyLevel = profile.levels.dessert;
      if (text.includes('coffee')) p = profile.levels.coffee;
      else if (text.includes('drink') || text.includes('beverage')) p = profile.levels.beverage;
      
      const currentSize = (activeCategory === 'Coffee' || activeCategory === 'Beverage') ? selectedSize : undefined;
      const data = await analyzeInput(selectedFile || queryText, p, requestedServings, currentSize);
      setRecipe(data);

      if (session?.user) {
        const { error: histErr } = await supabase.from('search_history').insert({
          user_id: session.user.id,
          query: typeof queryText === 'string' ? queryText : 'Image Analysis',
          result: data,
          created_at: new Date().toISOString()
        });
        if (histErr) logSupabaseError("History Insert", histErr);
        
        const { data: historyData } = await supabase.from('search_history').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(10);
        if (historyData) setSearchHistory(historyData);
      }

    } catch (err: any) {
      console.error(err.message || "Cloud brain is busy.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleSaveRecipe = async () => {
    if (!recipe || !session?.user) return;
    const userId = session.user.id;
    const exists = savedRecipes.find(r => r.itemName === recipe.itemName);
    try {
      if (exists) {
        const { error: delErr } = await supabase.from('saved_recipes').delete().eq('user_id', userId).filter('recipe_data->>itemName', 'eq', recipe.itemName);
        if (delErr) logSupabaseError("Save Delete", delErr);
        else setSavedRecipes(savedRecipes.filter(r => r.itemName !== recipe.itemName));
      } else {
        const { error: insErr } = await supabase.from('saved_recipes').insert({ user_id: userId, recipe_data: recipe });
        if (insErr) logSupabaseError("Save Insert", insErr);
        else setSavedRecipes([...savedRecipes, recipe]);
      }
    } catch (err: any) {
      console.error("Save exception:", err?.message);
    }
  };

  const handleShare = async () => {
    if (!recipe) return;
    const recipeSummary = `🍰 ${recipe.itemName}\n\n"${recipe.description}"\n\n⏱️ ${recipe.prepTime}\n👥 ${recipe.servings}\n🔥 ${recipe.calories}\n\n🛒 Ingredients:\n${recipe.ingredients.map(i => `• ${i}`).join('\n')}\n\nShared via SweetSpot`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `SweetSpot: ${recipe.itemName}`, text: recipeSummary });
      } else {
        await navigator.clipboard.writeText(recipeSummary);
        alert('Recipe copied to clipboard!');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
        console.error('Sharing failed:', err?.message);
      }
    }
  };

  const finalizePost = async () => {
    if (!postImage || !session?.user) return;
    setIsPosting(true);
    try {
      const compressed = await compressImage(postImage);
      const newEntry = {
        user_id: session.user.id,
        photo: compressed,
        text: postCaption || `My ${recipe?.itemName || 'Sweet'} creation!`,
        date: new Date().toISOString()
      };
      const { data, error: insertError } = await supabase.from('diaries').insert(newEntry).select();
      if (insertError) {
        logSupabaseError("Finalize Post", insertError);
        alert(`Post failed: See console for details.`);
      } else if (data && data[0]) {
        setProfile(prev => ({ ...prev, diaries: [data[0] as DiaryEntry, ...prev.diaries] }));
        setShowPostFlow(false);
        setPostImage(null);
        setPostCaption('');
      }
    } catch (err: any) {
      console.error("Post exception:", err.message);
      alert("An unexpected error occurred while posting.");
    } finally {
      setIsPosting(false);
    }
  };

  const updateProficiency = async (category: keyof typeof profile.levels, level: ProficiencyLevel) => {
    if (!session?.user) return;
    const newLevels = { ...profile.levels, [category]: level };
    setProfile(prev => ({ ...prev, levels: newLevels }));
    await syncProfile(session.user.id, { levels: newLevels });
  };

  const ProficiencyToggle = ({ category, current }: { category: keyof typeof profile.levels, current: ProficiencyLevel }) => {
    const levels: ProficiencyLevel[] = ['Beginner', 'Intermediate', 'Professional'];
    return (
      <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
        {levels.map(l => (
          <button 
            key={l} 
            onClick={() => updateProficiency(category, l)} 
            className={`flex-1 py-2 text-[10px] font-bold rounded-lg transition-all ${current === l ? 'bg-white text-orange-500 shadow-sm' : 'text-slate-400'}`}
          >
            {l}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f2f6ff] text-slate-800 flex justify-center py-4 md:py-8 overflow-x-hidden">
      <div className="w-full max-w-[420px] bg-[#fdfdff] min-h-[850px] md:min-h-[900px] shadow-[0_40px_100px_rgba(0,0,0,0.08)] md:rounded-[3.5rem] relative flex flex-col overflow-hidden pb-20">
        
        {/* LOGIN OVERLAY */}
        {!session && (
          <div className="absolute inset-0 z-[500] bg-white flex flex-col p-10 animate-in fade-in duration-500 overflow-y-auto hide-scrollbar">
            <div className="flex-1 flex flex-col justify-center items-center text-center">
              <div className="w-48 h-48 mb-8 flex items-center justify-center">
                <img 
                  src="https://raw.githubusercontent.com/stackblitz/stackblitz-images/main/sweetspot-logo.png" 
                  alt="SweetSpot Logo" 
                  className="w-full h-full object-contain drop-shadow-2xl"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "https://img.icons8.com/plasticine/200/cake.png";
                  }}
                />
              </div>
              <h1 className="text-4xl font-bold mb-3">Sweet<span className="italic font-normal">Spot</span></h1>
              <p className="text-slate-400 text-sm mb-12 px-6">Your personal AI recipe tracker and visual baker diary.</p>
              
              <div className="w-full space-y-5 max-w-[320px]">
                <div className="space-y-4">
                  {authError && (
                    <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-2xl text-xs flex items-center gap-2 animate-in slide-in-from-top duration-300">
                      <AlertCircle size={16} className="shrink-0" />
                      <p>{authError}</p>
                    </div>
                  )}
                  {authMessage && (
                    <div className="bg-green-50 border border-green-100 text-green-600 px-4 py-3 rounded-2xl text-xs flex items-center gap-2 animate-in slide-in-from-top duration-300">
                      <Info size={16} className="shrink-0" />
                      <p>{authMessage}</p>
                    </div>
                  )}

                  {authMode === 'signup' && (
                    <div className="relative">
                      <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                      <input 
                        type="text" 
                        placeholder="Display Username" 
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-orange-200 transition-all text-sm" 
                        value={authForm.username} 
                        onChange={e => setAuthForm({...authForm, username: e.target.value})} 
                      />
                    </div>
                  )}
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input 
                      type="email" 
                      placeholder="Email Address" 
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-orange-200 transition-all text-sm" 
                      value={authForm.email} 
                      onChange={e => setAuthForm({...authForm, email: e.target.value})} 
                    />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input 
                      type="password" 
                      placeholder="Password (min. 6 chars)" 
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-orange-200 transition-all text-sm" 
                      value={authForm.password} 
                      onChange={e => setAuthForm({...authForm, password: e.target.value})} 
                    />
                  </div>
                  
                  <button 
                    onClick={handleAuth} 
                    disabled={isAuthLoading || authCooldown > 0}
                    className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold shadow-lg shadow-slate-100 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isAuthLoading ? <Loader2 className="animate-spin" size={20} /> : authCooldown > 0 ? <Clock size={20} /> : <Sparkles size={20} />}
                    {authCooldown > 0 ? `Please wait ${authCooldown}s` : (authMode === 'signin' ? 'Sign In' : 'Sign Up')}
                  </button>

                  {showResend && (
                    <button 
                      onClick={handleResendLink} 
                      disabled={isAuthLoading || authCooldown > 0}
                      className="w-full border-2 border-slate-100 text-slate-600 py-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-all disabled:opacity-50"
                    >
                      <RefreshCcw size={14} /> Resend Confirmation Link
                    </button>
                  )}
                  
                  <div className="pt-2 text-center">
                    <button 
                      onClick={() => {
                        setAuthMode(authMode === 'signin' ? 'signup' : 'signin');
                        setAuthError(null);
                        setAuthMessage(null);
                        setShowResend(false);
                      }}
                      className="text-xs font-bold text-orange-500 hover:text-orange-600 transition-colors"
                    >
                      {authMode === 'signin' ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-center text-slate-300 uppercase tracking-widest font-bold mt-12 mb-6 px-10">
              Check your spam folder if you don't receive the email within a minute.
            </p>
            <p className="text-[10px] text-center text-slate-200 uppercase tracking-widest font-bold mb-6">Powered by Google Gemini & Supabase</p>
          </div>
        )}

        {/* POST FLOW OVERLAY */}
        {showPostFlow && (
          <div className="absolute inset-0 z-[600] bg-white animate-in slide-in-from-bottom duration-300 flex flex-col">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-50">
              <button onClick={() => { setShowPostFlow(false); setPostImage(null); setPostCaption(''); }} className="p-2 hover:bg-slate-50 rounded-full transition-colors"><X size={24} /></button>
              <h3 className="font-bold text-lg">New Diary Entry</h3>
              <button onClick={finalizePost} disabled={!postImage || isPosting} className={`font-bold text-orange-500 px-4 py-2 rounded-xl active:scale-95 transition-all ${(!postImage || isPosting) && 'opacity-30 cursor-not-allowed'}`}>
                {isPosting ? <Loader2 className="animate-spin" size={20} /> : 'Share'}
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto hide-scrollbar">
              {!postImage ? (
                <div className="flex flex-col items-center justify-center p-12 bg-slate-50/50 min-h-[400px]">
                  <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center mb-8 shadow-sm border border-slate-100"><Camera size={40} className="text-slate-300" /></div>
                  <p className="text-slate-500 font-medium mb-10 text-center max-w-[200px]">Snap your creation or choose a photo</p>
                  <button onClick={() => postFileRef.current?.click()} className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-bold shadow-xl shadow-slate-100 flex items-center gap-2"><Upload size={18} /> Choose Photo</button>
                  <input type="file" ref={postFileRef} className="hidden" accept="image/*" onChange={handlePostImageSelect} />
                </div>
              ) : (
                <div className="p-6 space-y-8 animate-in fade-in zoom-in duration-300">
                  <div className="aspect-square w-full rounded-3xl overflow-hidden shadow-2xl relative bg-slate-100">
                    <img src={postImage} className="w-full h-full object-cover" />
                    <button 
                      onClick={() => postFileRef.current?.click()} 
                      className="absolute bottom-4 right-4 bg-white/20 backdrop-blur-md p-3 rounded-2xl text-white border border-white/30 hover:bg-white/40 transition-all flex items-center gap-2 text-xs font-bold"
                    >
                      <ImageIcon size={16} /> Replace Photo
                    </button>
                    <input type="file" ref={postFileRef} className="hidden" accept="image/*" onChange={handlePostImageSelect} />
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Describe your masterpiece</label>
                    <textarea 
                      placeholder="Was it crunchy? Sweet? Perfect for a rainy day? Write your thoughts..." 
                      className="w-full h-40 bg-slate-50 border border-slate-100 rounded-2xl p-6 outline-none text-sm placeholder:text-slate-300 focus:border-orange-200 transition-all resize-none leading-relaxed" 
                      value={postCaption} 
                      onChange={e => setPostCaption(e.target.value)} 
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* HOME TAB */}
        {activeTab === 'home' && (
          <div className="flex-1 flex flex-col px-8 py-10 animate-in fade-in duration-500 overflow-y-auto hide-scrollbar pb-10">
            <h1 className="text-[42px] leading-tight mb-8">Sweet<span className="font-bold italic text-slate-900">Spot</span></h1>
            <div className="flex gap-4 mb-8 overflow-x-auto hide-scrollbar py-2">
              {(['Dessert', 'Beverage', 'Coffee'] as Category[]).map(cat => (
                <button key={cat} onClick={() => { setActiveCategory(cat); if (cat === 'Dessert') setSelectedSize('12oz'); }} className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm transition-all whitespace-nowrap ${activeCategory === cat ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-100'}`}>
                  {cat === 'Dessert' && <Cake size={16} />}
                  {cat === 'Beverage' && <GlassWater size={16} />}
                  {cat === 'Coffee' && <CoffeeIcon size={16} />}
                  {cat}
                </button>
              ))}
            </div>
            <div className="flex-1 flex flex-col">
              <div className="relative group cursor-pointer" onClick={() => (inputText || selectedFile) && startAnalysis()}>
                <div className="absolute top-0 right-0 z-10 -translate-y-4 translate-x-4">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center bg-[#ff734c] text-white shadow-xl shadow-orange-100"><Plus size={20} /></div>
                </div>
                <div className="bg-[#e0e8ff] rounded-[2.5rem] p-8 pt-10 relative overflow-hidden h-[200px]">
                  {previewUrl && <img src={previewUrl} className="absolute inset-0 w-full h-full object-cover opacity-80" />}
                  {!previewUrl && <div className="absolute -top-12 -right-12 w-64 h-64 bg-white/20 rounded-full blur-3xl" />}
                  <div className="relative z-10 space-y-4">
                    <div className="w-3 h-3 bg-orange-500 rounded-full" />
                    <h2 className="text-3xl leading-snug font-bold">Visual Baker</h2>
                    <p className="text-xs text-slate-500 font-bold tracking-wider opacity-60 uppercase">AI Powered Analysis</p>
                  </div>
                </div>
              </div>
              <div className="mt-8 space-y-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Serving Size</label>
                  <div className="flex items-center gap-4 bg-slate-100/80 p-1 rounded-2xl">
                    <button onClick={(e) => { e.stopPropagation(); setRequestedServings(Math.max(1, requestedServings - 1))}} className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-slate-600 hover:text-orange-500 transition-colors"><Minus size={16} /></button>
                    <div className="flex-1 text-center font-bold text-slate-800 flex items-center justify-center gap-2">
                      <Users size={16} className="text-orange-400" /> {requestedServings} {requestedServings === 1 ? 'Person' : 'People'}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setRequestedServings(Math.min(10, requestedServings + 1))}} className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-slate-600 hover:text-orange-500 transition-colors"><Plus size={16} /></button>
                  </div>
                </div>

                {(activeCategory === 'Coffee' || activeCategory === 'Beverage') && (
                  <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top duration-300">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Cup Size</label>
                    <div className="flex gap-2 p-1 bg-slate-100/80 rounded-2xl">
                      {['8oz', '12oz', '16oz', '20oz'].map(size => (
                        <button 
                          key={size} 
                          onClick={() => setSelectedSize(size)} 
                          className={`flex-1 py-3 text-[10px] font-bold rounded-xl transition-all ${selectedSize === size ? 'bg-white text-orange-500 shadow-sm' : 'text-slate-400'}`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <input type="text" placeholder={`Search ${activeCategory.toLowerCase()}...`} className="flex-1 bg-white shadow-sm rounded-2xl px-6 py-4 text-sm outline-none border-2 border-slate-50 focus:border-orange-200 transition-all" value={inputText} onChange={(e) => { setInputText(e.target.value); setSelectedFile(null); setPreviewUrl(null); }} />
                  <label className="w-14 h-14 bg-white shadow-sm rounded-2xl flex items-center justify-center cursor-pointer text-slate-400 hover:text-slate-600 border-2 border-slate-50">
                    <Upload size={20} /><input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                  </label>
                </div>
                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Suggested {activeCategory}</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {SUGGESTIONS[activeCategory].map((item, idx) => (
                      <button key={idx} onClick={() => { setInputText(item); startAnalysis(item); }} className="bg-white p-4 rounded-2xl border border-slate-100 text-left hover:border-orange-200 hover:bg-orange-50/30 transition-all group">
                        <span className="text-xs font-bold text-slate-700 block mb-1 group-hover:text-orange-600">{item}</span>
                        <div className="flex items-center gap-1 text-[9px] text-slate-400 font-bold uppercase tracking-tighter">
                          <Sparkles size={10} className="text-orange-400" /> Quick Recipe
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <button disabled={(!inputText && !selectedFile) || isAnalyzing} onClick={() => startAnalysis()} className="w-full bg-[#ff734c] text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-orange-100 active:scale-[0.98] transition-all disabled:opacity-50">
                  {isAnalyzing ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />} Analyze Sweet
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PROFILE TAB */}
        {activeTab === 'profile' && (
          <div className="flex-1 flex flex-col p-8 animate-in slide-in-from-right duration-500 overflow-y-auto hide-scrollbar pb-24">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-bold">Cloud Profile</h2>
              <button onClick={() => setIsEditingProfile(!isEditingProfile)} className="p-2 text-slate-400 hover:text-slate-900 transition-colors"><Settings2 size={24} /></button>
            </div>
            <div className="flex flex-col items-center mb-10">
              <div className="relative cursor-pointer" onClick={() => avatarFileRef.current?.click()}>
                <div className="w-28 h-28 rounded-[2rem] bg-slate-100 overflow-hidden border-4 border-white shadow-xl flex items-center justify-center">
                  {profile.avatar ? <img src={profile.avatar} className="w-full h-full object-cover" /> : <User size={40} className="text-slate-300" />}
                </div>
                <div className="absolute bottom-0 right-0 w-8 h-8 bg-slate-900 rounded-xl flex items-center justify-center text-white border-2 border-white"><Camera size={14} /></div>
                <input type="file" ref={avatarFileRef} className="hidden" accept="image/*" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file && session?.user) {
                    const reader = new FileReader();
                    reader.onloadend = async () => {
                      const url = await compressImage(reader.result as string, 400, 400);
                      setProfile({...profile, avatar: url});
                      syncProfile(session.user.id, {avatar: url});
                    };
                    reader.readAsDataURL(file);
                  }
                }} />
              </div>
              <h3 className="mt-4 text-xl font-bold">{authForm.username}</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">{authForm.email}</p>
              {isEditingProfile && (
                <div className="w-full mt-6 p-4 bg-slate-50 rounded-2xl space-y-4 animate-in fade-in duration-300">
                  <input type="text" value={authForm.username} onChange={e => setAuthForm({...authForm, username: e.target.value})} className="w-full p-3 text-sm bg-white rounded-xl border border-slate-100 outline-none focus:border-orange-300" placeholder="New Username" />
                  <div className="flex gap-2">
                    <button onClick={() => { if (session?.user) syncProfile(session.user.id, {username: authForm.username}); setIsEditingProfile(false); }} className="flex-1 bg-slate-900 text-white py-3 rounded-xl text-xs font-bold">Save Changes</button>
                    <button onClick={handleLogout} className="px-4 bg-red-50 text-red-500 py-3 rounded-xl text-xs font-bold flex items-center gap-1"><LogOut size={14} /> Logout</button>
                  </div>
                </div>
              )}
            </div>
            
            <div className="space-y-6 mb-10">
               <button onClick={() => setActiveTab('history')} className="w-full p-6 bg-orange-50 rounded-[2.5rem] flex items-center justify-between group active:scale-[0.98] transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-orange-500 shadow-sm border border-orange-100/50"><History size={20} /></div>
                    <div className="text-left">
                      <h4 className="font-bold text-slate-800">My Sweets History</h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">See past analyses</p>
                    </div>
                  </div>
                  <ChevronRight className="text-slate-300 group-hover:text-orange-500 transition-colors" />
               </button>
            </div>

            <div className="space-y-6 mb-12">
              <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest">My Preference Levels</h4>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold flex justify-between items-center">
                    <span>Dessert Master</span>
                    <span className="text-orange-500 text-[10px]">{profile.levels.dessert}</span>
                  </label>
                  <ProficiencyToggle category="dessert" current={profile.levels.dessert} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold flex justify-between items-center">
                    <span>Mixologist</span>
                    <span className="text-orange-500 text-[10px]">{profile.levels.beverage}</span>
                  </label>
                  <ProficiencyToggle category="beverage" current={profile.levels.beverage} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold flex justify-between items-center">
                    <span>Barista</span>
                    <span className="text-orange-500 text-[10px]">{profile.levels.coffee}</span>
                  </label>
                  <ProficiencyToggle category="coffee" current={profile.levels.coffee} />
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Sweet Diary</h4>
                <button onClick={() => setShowPostFlow(true)} className="text-orange-500 font-bold text-xs flex items-center gap-1 active:scale-90 transition-all"><Plus size={14} /> Post New</button>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                {profile.diaries.length === 0 ? (
                  <div className="col-span-2 text-center py-16 px-10 bg-slate-50 rounded-[2.5rem] border border-dashed border-slate-200">
                    <ImageIcon size={32} className="text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400 text-xs italic">Your diary is waiting for its first entry. Share your baking moments!</p>
                  </div>
                ) : (
                  profile.diaries.map(d => (
                    <div key={d.id} className="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-50 group active:scale-95 transition-all">
                      <div className="aspect-square relative overflow-hidden">
                        <img src={d.photo} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                        <div className="absolute top-2 right-2 px-2 py-1 bg-white/40 backdrop-blur-md rounded-lg text-[8px] font-black text-white uppercase tracking-tighter">
                          {new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                      <div className="p-4">
                        <p className="text-[11px] text-slate-600 font-medium leading-relaxed line-clamp-2">{d.text}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* SAVED TAB */}
        {activeTab === 'saved' && (
          <div className="flex-1 flex flex-col p-8 animate-in slide-in-from-bottom duration-500 overflow-y-auto hide-scrollbar pb-24">
            <h2 className="text-3xl font-bold mb-8">Saved <span className="text-orange-500">Sweets</span></h2>
            <div className="space-y-4">
              {savedRecipes.length === 0 ? (
                <div className="text-center py-20 text-slate-300 italic">No saved sweets yet. Explore recipes to save them here!</div>
              ) : (
                savedRecipes.map((r, i) => (
                  <div key={i} onClick={() => { setRecipe(r); setPreviewUrl(null); }} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4 hover:border-orange-200 cursor-pointer transition-all active:scale-[0.98]">
                    <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-400 font-bold text-2xl">🍰</div>
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-800">{r.itemName}</h4>
                      <p className="text-xs text-slate-400 uppercase tracking-widest">{r.prepTime} • {r.calories}</p>
                    </div>
                    <Bookmark className="text-orange-500" fill="#ff734c" size={18} />
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <div className="flex-1 flex flex-col p-8 animate-in slide-in-from-left duration-500 overflow-y-auto hide-scrollbar pb-24">
            <div className="flex items-center gap-4 mb-8">
              <button onClick={() => setActiveTab('profile')} className="p-2 -ml-2 text-slate-400 hover:text-slate-900"><ArrowLeft size={24} /></button>
              <h2 className="text-3xl font-bold">Search History</h2>
            </div>
            <div className="space-y-4">
              {searchHistory.length === 0 ? (
                <div className="text-center py-20 text-slate-300 italic">Your history is clear. Start exploring recipes!</div>
              ) : (
                searchHistory.map((h, i) => (
                  <div key={h.id} onClick={() => { setRecipe(h.result); setPreviewUrl(null); }} className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4 hover:border-orange-200 cursor-pointer transition-all">
                    <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-orange-400"><History size={20} /></div>
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-800 line-clamp-1">{h.query}</h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{new Date(h.created_at).toLocaleDateString()}</p>
                    </div>
                    <ChevronRight className="text-slate-200" size={18} />
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* RECIPE VIEW */}
        {activeTab === 'recipe' && recipe && (
          <div className="flex-1 flex flex-col bg-[#eef3ff] animate-in slide-in-from-right duration-500 overflow-y-auto hide-scrollbar relative">
            <div className="h-[340px] w-full relative overflow-hidden bg-slate-200">
               {heroImage ? (
                 <img src={heroImage} className="w-full h-full object-cover animate-in fade-in duration-700" alt={recipe.itemName} />
               ) : (
                 <div className="w-full h-full flex flex-col items-center justify-center bg-orange-50 text-orange-200">
                   <div className="absolute inset-0 bg-gradient-to-t from-orange-100 to-transparent animate-pulse" />
                   <Sparkles size={80} />
                   <span className="text-xs font-bold tracking-[0.2em] uppercase mt-4 text-orange-300 text-center px-8">Generating Gourmet Photo...</span>
                 </div>
               )}
               <div className="absolute top-0 left-0 right-0 px-8 py-10 flex justify-between items-center z-30">
                 <button onClick={() => setActiveTab('home')} className="p-2 bg-white/20 backdrop-blur-md rounded-xl text-white hover:bg-white/40"><ArrowLeft size={24} /></button>
                 <div className="flex gap-2">
                   <button onClick={handleShare} className="p-2 bg-white/20 backdrop-blur-md rounded-xl text-white hover:bg-white/40"><Share2 size={24} /></button>
                   <button onClick={toggleSaveRecipe} className={`p-2 backdrop-blur-md rounded-xl shadow-lg transition-all ${savedRecipes.some(r => r.itemName === recipe.itemName) ? 'bg-orange-500 text-white' : 'bg-white/20 text-white hover:bg-white/40'}`}>
                     {savedRecipes.some(r => r.itemName === recipe.itemName) ? <CheckCircle2 size={24} /> : <Bookmark size={24} />}
                   </button>
                 </div>
               </div>
            </div>
            <div className="bg-white rounded-[3.5rem] -mt-16 relative z-10 p-10 shadow-[0_-20px_60px_rgba(0,0,0,0.05)]">
              <div className="w-12 h-1 bg-slate-100 rounded-full mx-auto mb-10" />
              <div className="mb-8">
                <span className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-2 block">AI Recipe • {activeCategory} Level</span>
                <h1 className="text-[40px] leading-tight mb-6 font-bold text-slate-900 serif">{recipe.itemName}</h1>
                <div className="flex justify-between items-center text-slate-400 font-bold text-[10px] tracking-[0.15em] border-y border-slate-50 py-6 mb-8">
                  <div className="flex items-center gap-2"><Clock size={14} className="text-orange-500" />{recipe.prepTime}</div>
                  <div className="flex items-center gap-2"><Users size={14} className="text-orange-500" />{recipe.servings}</div>
                  <div className="flex items-center gap-2"><Flame size={14} className="text-orange-500" />{recipe.calories}</div>
                </div>
              </div>
              <section className="mb-12">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><div className="w-1.5 h-6 bg-orange-500 rounded-full" />Ingredients</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {recipe.ingredients.map((ing, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl text-[13px] text-slate-600 font-medium">
                      <div className="w-5 h-5 rounded-lg bg-white flex items-center justify-center text-[10px] shadow-sm">{i + 1}</div>{ing}
                    </div>
                  ))}
                </div>
              </section>
              <section className="pb-10">
                <h3 className="text-xl font-bold mb-8 flex items-center gap-2"><div className="w-1.5 h-6 bg-orange-500 rounded-full" />Directions</h3>
                <div className="space-y-16">
                  {recipe.steps.map((step) => (
                    <div key={step.stepNumber} className="relative">
                      <div className="flex items-start gap-6 mb-6">
                        <div className="w-10 h-10 bg-slate-900 text-white rounded-2xl flex items-center justify-center text-sm font-black flex-shrink-0 shadow-lg">{step.stepNumber}</div>
                        <p className="text-[15px] leading-relaxed text-slate-700 font-medium">{step.description}</p>
                      </div>
                      <div className="w-full aspect-[4/3] bg-white rounded-3xl overflow-hidden relative flex items-center justify-center border border-slate-50 shadow-sm">
                        {illustrations[step.stepNumber]?.url ? (
                          <img src={illustrations[step.stepNumber].url!} className="w-full h-full object-contain p-6 animate-in zoom-in duration-700" />
                        ) : (
                          <div className="flex flex-col items-center gap-3 opacity-30">
                            <Loader2 className="animate-spin text-orange-500" size={28} />
                            <span className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">Painting Step...</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <button onClick={() => { setPostImage(heroImage); setShowPostFlow(true); }} className="w-full mt-12 bg-orange-50 text-orange-600 py-5 rounded-2xl font-bold flex items-center justify-center gap-2 border-2 border-orange-100 hover:bg-orange-100 active:scale-95 transition-all"><Camera size={20} /> Share Result to Diary</button>
            </div>
          </div>
        )}

        {/* NAVIGATION */}
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] h-20 bg-white/95 backdrop-blur-xl border-t border-slate-50 px-10 flex justify-between items-center z-[100] md:rounded-b-[3.5rem]">
          <button onClick={() => setActiveTab('home')} className={`${activeTab === 'home' ? 'text-orange-500' : 'text-slate-300'} flex flex-col items-center gap-1 active:scale-90 transition-all`}>
            <Home size={22} />
            <span className="text-[8px] font-bold uppercase tracking-widest">Home</span>
          </button>
          <button onClick={() => setActiveTab('profile')} className={`${activeTab === 'profile' ? 'text-orange-500' : 'text-slate-300'} flex flex-col items-center gap-1 active:scale-90 transition-all`}>
            <User size={22} />
            <span className="text-[8px] font-bold uppercase tracking-widest">Profile</span>
          </button>
          <button onClick={() => setActiveTab('saved')} className={`${activeTab === 'saved' ? 'text-orange-500' : 'text-slate-300'} flex flex-col items-center gap-1 active:scale-90 transition-all`}>
            <Bookmark size={22} fill={activeTab === 'saved' ? "currentColor" : "none"} />
            <span className="text-[8px] font-bold uppercase tracking-widest">Saved</span>
          </button>
        </div>

        {isAnalyzing && (
          <div className="absolute inset-0 z-[200] bg-white/95 backdrop-blur-xl flex flex-col items-center justify-center p-12 text-center">
             <div className="w-24 h-24 rounded-[2.5rem] bg-orange-50 flex items-center justify-center mb-10 relative">
               <div className="absolute inset-0 bg-orange-500/10 rounded-[2.5rem] animate-ping" />
               <Sparkles className="text-orange-500" size={48} />
             </div>
             <h3 className="text-3xl font-bold mb-3 tracking-tight serif">Cloud Analysis</h3>
             <p className="text-[15px] text-slate-400 italic">"Gearing up for your {activeCategory} skills..."</p>
          </div>
        )}
      </div>
    </div>
  );
}
