import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Sparkles, 
  User, 
  Camera, 
  Briefcase, 
  UploadCloud, 
  FileCheck, 
  Trash2, 
  CheckCircle2, 
  AlertCircle,
  Phone
} from 'lucide-react';
import { JobPost, UserProfile } from '../types';

interface ApplicationFormModalProps {
  job: JobPost | null;
  profile: UserProfile | null;
  onClose: () => void;
  onSubmit: (data: {
    candidateName: string;
    photoURL: string;
    experienceYears: number;
    phone: string;
    cvName?: string;
    cvUrl?: string;
    message: string;
  }) => void;
}

export function ApplicationFormModal({ job, profile, onClose, onSubmit }: ApplicationFormModalProps) {
  if (!job) return null;

  const [isMobile, setIsMobile] = useState(false);
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const [name, setName] = useState(profile?.displayName || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [experience, setExperience] = useState<number>(1);
  const [selectedPhoto, setSelectedPhoto] = useState(profile?.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop');
  const [cvFile, setCvFile] = useState<{ name: string; size: string; content?: string } | null>(
    profile?.cvName ? { name: profile.cvName, size: 'Enregistré sur votre profil', content: profile.cvUrl } : null
  );
  const [message, setMessage] = useState("Bonjour, je souhaite vivement proposer ma candidature pour ce poste. J'ai l'expérience requise et mon profil correspond tout à fait à vos attentes.");
  
  const [photoOptionType, setPhotoOptionType] = useState<'profile' | 'preset'>('profile');
  const [isDragging, setIsDragging] = useState(false);
  const [isPhotoHovered, setIsPhotoHovered] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preset avatars for rapid custom picking
  const presetAvatars = [
    'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop', // Woman
    'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=200&auto=format&fit=crop', // Man
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=200&auto=format&fit=crop', // Woman 2
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=200&auto=format&fit=crop', // Man 2
  ];

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        setCvFile({
          name: file.name,
          size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
          content: reader.result as string
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        setCvFile({
          name: file.name,
          size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
          content: reader.result as string
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert("S'il vous plaît, renseignez votre nom complet.");
      return;
    }
    if (!phone.trim()) {
      alert("S'il vous plaît, renseignez votre numéro de téléphone.");
      return;
    }
    onSubmit({
      candidateName: name,
      photoURL: selectedPhoto,
      experienceYears: Number(experience),
      phone: phone.trim(),
      cvName: cvFile ? cvFile.name : undefined,
      cvUrl: cvFile ? cvFile.content : undefined,
      message: message
    });
  };

  const modalAnimation = isMobile ? {
    initial: { y: "100%" },
    animate: { y: 0 },
    exit: { y: "100%" },
    transition: {  damping: 25, stiffness: 220 }
  } : {
    initial: { scale: 0.95, y: 20 },
    animate: { scale: 1, y: 0 },
    exit: { scale: 0.95, y: 20 }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[190] flex items-end sm:items-center justify-center sm:p-4 overflow-y-auto"
    >
      <motion.div 
        {...modalAnimation}
        className="bg-white max-w-xl w-full rounded-t-[32px] sm:rounded-[32px] overflow-hidden shadow-2xl border border-slate-100 flex flex-col relative font-sans max-h-[85vh] sm:max-h-[90vh] my-0 sm:my-4"
      >
        {isMobile && (
          <div className="pt-3 pb-1 shrink-0 flex justify-center bg-slate-50/70 border-b border-slate-100">
            <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
          </div>
        )}
        {/* Header */}
        <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-bold">
              <Briefcase className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-black text-emerald-600 tracking-wider uppercase">POSTULER</span>
              <h3 className="font-bold text-slate-800 text-sm md:text-md truncate max-w-[280px] md:max-w-[340px] leading-tight">
                {job.title}
              </h3>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmitForm} className="p-6 md:p-8 overflow-y-auto space-y-6 flex-1">
          {/* Section 1: Candidate identity & photo */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {/* Photo chooser */}
            <div className="flex flex-col items-center text-center space-y-3">
              <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Photo professionnelle</span>
              
              <div 
                className="relative cursor-pointer group"
                onClick={() => setPhotoOptionType(photoOptionType === 'profile' ? 'preset' : 'profile')}
                onMouseEnter={() => setIsPhotoHovered(true)}
                onMouseLeave={() => setIsPhotoHovered(false)}
              >
                <img 
                  src={selectedPhoto} 
                  alt="Avatar" 
                  className="h-24 w-24 rounded-full border-4 border-slate-50 object-cover shadow-md group-hover:brightness-95 transition-all" 
                />
                
                <div className="absolute bottom-0 right-0 bg-emerald-600 text-white p-2 rounded-full shadow-lg border-2 border-white transition-all transform group-hover:scale-110">
                  <Camera className="h-3.5 w-3.5" />
                </div>
              </div>

              <div className="w-full flex justify-center gap-1.5 pt-1">
                {presetAvatars.map((av, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => {
                      setSelectedPhoto(av);
                      setPhotoOptionType('preset');
                    }}
                    className={`w-7 h-7 rounded-full overflow-hidden border-2 transition-all ${
                      selectedPhoto === av ? 'border-emerald-600 scale-110 shadow-sm' : 'border-slate-200 hover:scale-105'
                    }`}
                  >
                    <img src={av} alt={`Preset ${index}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
              
              <p className="text-[10px] text-slate-400 font-medium">Sélectionnez une photo pro ci-dessus</p>
            </div>

            {/* Inputs: Name & Experience */}
            <div className="md:col-span-2 space-y-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5 flex items-center gap-1">
                  <User className="h-3 w-3" /> Nom Complet <span className="text-red-500">*</span>
                </label>
                <input 
                  required
                  type="text" 
                  className="w-full bg-slate-50 border-none focus:bg-white focus:ring-1 focus:ring-emerald-500 px-3 py-2 text-xs rounded-xl h-11 font-semibold outline-none text-slate-800"
                  placeholder="ex: Marie-Laure Kacou"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5 flex items-center gap-1">
                  <Phone className="h-3 w-3" /> Numéro de Téléphone Direct <span className="text-red-500">*</span>
                </label>
                <input 
                  required
                  type="tel" 
                  className="w-full bg-slate-50 border-none focus:bg-white focus:ring-1 focus:ring-emerald-500 px-3 py-2 text-xs rounded-xl h-11 font-semibold outline-none text-slate-800"
                  placeholder="ex: +225 07 48 92 11 02"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5 flex items-center gap-1">
                  <Briefcase className="h-3 w-3" /> Années d'expérience <span className="text-red-500">*</span>
                </label>
                <select 
                  className="w-full bg-slate-50 border-none focus:bg-white focus:ring-1 focus:ring-emerald-500 px-3 py-2 text-xs rounded-xl h-11 font-semibold outline-none text-slate-800"
                  value={experience}
                  onChange={e => setExperience(Number(e.target.value))}
                >
                  <option value={0}>Débutant(e) / Sans expérience</option>
                  <option value={1}>1 an d'expérience</option>
                  <option value={2}>2 ans d'expérience</option>
                  <option value={3}>3 ans d'expérience</option>
                  <option value={4}>4 ans d'expérience</option>
                  <option value={5}>5 ans d'expérience</option>
                  <option value={8}>De 5 à 10 ans d'expérience</option>
                  <option value={12}>Plus de 10 ans d'expérience</option>
                </select>
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Section 2: Simulated CV Upload Drawer */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase font-bold text-slate-400 block">
              Curriculum Vitae (CV) <span className="text-slate-405 font-medium">(Optionnel)</span>
            </label>

            {!cvFile ? (
              <div 
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                onClick={triggerFileSelect}
                className={`border-2 border-dashed rounded-3xl p-6 text-center cursor-pointer transition-all ${
                  isDragging 
                    ? 'border-emerald-500 bg-emerald-50/20' 
                    : 'border-slate-200 hover:border-emerald-400 hover:bg-slate-50/50'
                }`}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileSelect} 
                  accept=".pdf,.doc,.docx" 
                  className="hidden" 
                />
                
                <UploadCloud className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">Faites glisser votre CV ici ou cliquez pour parcourir</p>
                <p className="text-[10px] text-slate-400 mt-1">Accepte les fichiers PDF, Word (.doc, .docx) jusqu'à 5 MB</p>
              </div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-emerald-50/45 border border-emerald-100 rounded-2xl p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center">
                    <FileCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 truncate max-w-[200px] sm:max-w-xs">{cvFile.name}</p>
                    <p className="text-[10px] text-emerald-700/80 font-semibold">{cvFile.size}</p>
                  </div>
                </div>
                
                <button 
                  type="button"
                  onClick={() => setCvFile(null)}
                  className="text-red-500 hover:bg-red-50 p-2 rounded-xl transition-all"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </motion.div>
            )}
          </div>

          {/* Section 3: Professional Message cover letter */}
          <div>
            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">
              Message d'accompagnement ou Présentation
            </label>
            <textarea 
              rows={4}
              required
              className="w-full bg-slate-50 border-none focus:bg-white focus:ring-1 focus:ring-emerald-500 p-4 text-xs font-semibold rounded-2xl outline-none text-slate-800 leading-relaxed placeholder:text-slate-350"
              placeholder="Écrivez un court mot pour interpeller et convaincre l'employeur..."
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
            <div className="flex items-center gap-1.5 text-emerald-600 mt-2">
              <Sparkles className="h-3 w-3 stroke-[2.5]" />
              <span className="text-[9px] font-black uppercase tracking-wider">Généré automatiquement par IvoireSource AI</span>
            </div>
          </div>

          {/* Bottom Buttons */}
          <div className="flex gap-3 border-t border-slate-100 pt-5 mt-4 shrink-0">
            <button 
              type="button" 
              onClick={onClose}
              className="flex-1 py-3.5 px-4 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all font-sans text-center"
            >
              Annuler
            </button>
            <button 
              type="submit" 
              className="flex-1 py-3.5 px-4 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-all font-sans text-center shadow-lg shadow-emerald-50"
            >
              Soumettre ma candidature
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
