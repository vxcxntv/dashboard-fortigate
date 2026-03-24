import React, { useState, useMemo } from 'react';
import { 
  UploadCloud, 
  Activity, 
  Database, 
  Clock, 
  Globe, 
  ShieldAlert,
  AlertCircle,
  FileText
} from 'lucide-react';

// --- Utilitários de Processamento de Dados ---

// Função para formatar bytes em KB, MB, GB
const formatBytes = (bytes, decimals = 2) => {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

// Função para formatar duração em formato legível
const formatDuration = (seconds) => {
  if (!seconds) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

// Parser do formato de log do Fortinet (chave=valor ou chave="valor com espaco")
const parseFortiLog = (text) => {
  const lines = text.split('\n');
  const data = [];
  const regex = /(\w+)=(?:\"([^\"]*)\"|([^ ]*))/g;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    let match;
    const entry = {};
    while ((match = regex.exec(line)) !== null) {
      const key = match[1];
      const value = match[2] !== undefined ? match[2] : match[3];
      entry[key] = value;
    }
    
    if (Object.keys(entry).length > 0) {
      // Tenta identificar o alvo principal (Site, App ou Serviço)
      entry._target = entry.hostname || entry.app || entry.dstinetsvc || entry.dstip || 'Desconhecido';
      
      // Converte bytes para inteiros
      entry._sentbyte = parseInt(entry.sentbyte || 0, 10);
      entry._rcvdbyte = parseInt(entry.rcvdbyte || 0, 10);
      entry._totalbyte = entry._sentbyte + entry._rcvdbyte;
      
      // Converte duração
      entry._duration = parseInt(entry.duration || 0, 10);
      
      data.push(entry);
    }
  }
  return data;
};

// --- Componentes de UI ---

const StatCard = ({ title, value, subtitle, icon: Icon, colorClass }) => (
  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start space-x-4">
    <div className={`p-3 rounded-lg ${colorClass} bg-opacity-10`}>
      <Icon className={`w-6 h-6 ${colorClass.replace('bg-', 'text-')}`} />
    </div>
    <div>
      <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
      <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
      {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
    </div>
  </div>
);

const ProgressBarChart = ({ data, title, valueFormatter, labelKey = 'name', valueKey = 'value', colorClass = 'bg-blue-500' }) => {
  if (!data || data.length === 0) return null;
  
  const maxValue = Math.max(...data.map(d => d[valueKey]));

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">{title}</h3>
      {/* Container com scroll para suportar os 50 itens sem quebrar a tela */}
      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
        {data.map((item, index) => {
          const percentage = maxValue > 0 ? (item[valueKey] / maxValue) * 100 : 0;
          return (
            <div key={index} className="w-full">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-slate-700 truncate pr-4" title={item[labelKey]}>
                  {index + 1}. {item[labelKey]}
                </span>
                <span className="text-slate-500 whitespace-nowrap">
                  {valueFormatter ? valueFormatter(item[valueKey]) : item[valueKey]}
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div 
                  className={`${colorClass} h-2 rounded-full transition-all duration-500`} 
                  style={{ width: `${percentage}%` }}
                ></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// --- Componente Principal ---

export default function App() {
  const [logs, setLogs] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState('');

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setIsProcessing(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const parsedData = parseFortiLog(text);
        setLogs(parsedData);
      } catch (err) {
        setError("Erro ao processar o arquivo. Certifique-se de que é um log válido do Fortinet.");
        console.error(err);
      } finally {
        setIsProcessing(false);
      }
    };
    reader.onerror = () => {
      setError("Erro ao ler o arquivo.");
      setIsProcessing(false);
    };
    
    reader.readAsText(file);
  };

  // Memoização das métricas processadas para performance
  const metrics = useMemo(() => {
    if (logs.length === 0) return null;

    let totalBytes = 0;
    let totalDuration = 0;
    const userSet = new Set();
    
    const appsMap = {};
    const categoriesMap = {};
    const riskMap = {};

    logs.forEach(log => {
      totalBytes += log._totalbyte;
      totalDuration += log._duration;
      
      if (log.user) userSet.add(log.user.toLowerCase());

      // Agrupa por Aplicação/Site
      const target = log._target;
      if (!appsMap[target]) {
        appsMap[target] = { name: target, sessions: 0, bytes: 0, duration: 0 };
      }
      appsMap[target].sessions += 1;
      appsMap[target].bytes += log._totalbyte;
      appsMap[target].duration += log._duration;

      // Agrupa por Categoria
      const category = log.appcat || 'Não Categorizado';
      if (!categoriesMap[category]) {
        categoriesMap[category] = { name: category, sessions: 0, bytes: 0 };
      }
      categoriesMap[category].sessions += 1;
      categoriesMap[category].bytes += log._totalbyte;

      // Agrupa por Risco
      const risk = log.apprisk || 'Desconhecido';
      if (!riskMap[risk]) {
        riskMap[risk] = { name: risk, sessions: 0 };
      }
      riskMap[risk].sessions += 1;
    });

    // Ordenações para os Top 50
    const topAppsBySessions = Object.values(appsMap).sort((a, b) => b.sessions - a.sessions).slice(0, 50);
    const topAppsByBytes = Object.values(appsMap).sort((a, b) => b.bytes - a.bytes).slice(0, 50);
    const topCategories = Object.values(categoriesMap).sort((a, b) => b.bytes - a.bytes).slice(0, 5);
    const riskLevels = Object.values(riskMap).sort((a, b) => b.sessions - a.sessions);

    return {
      totalSessions: logs.length,
      totalBytes,
      totalDuration,
      uniqueUsers: userSet.size,
      mainUser: Array.from(userSet)[0] || 'Desconhecido',
      topAppsBySessions,
      topAppsByBytes,
      topCategories,
      riskLevels
    };
  }, [logs]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Cabeçalho */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2">
              <Activity className="w-8 h-8 text-blue-600" />
              Análise de Tráfego do Usuário
            </h1>
            <p className="text-slate-500 mt-1">
              Dashboard quantitativo de acessos baseado em logs do FortiGate/FortiCloud.
            </p>
          </div>
          
          <div className="flex items-center">
            <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm">
              <UploadCloud className="w-5 h-5" />
              <span>Carregar Log (.txt)</span>
              <input 
                type="file" 
                accept=".txt,.log" 
                className="hidden" 
                onChange={handleFileUpload}
              />
            </label>
          </div>
        </div>

        {/* Mensagens de Status */}
        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-center gap-3 border border-red-200">
            <AlertCircle className="w-5 h-5" />
            <p>{error}</p>
          </div>
        )}

        {isProcessing && (
          <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-slate-600 font-medium">Analisando registros de tráfego...</p>
          </div>
        )}

        {/* Estado Inicial (Sem dados) */}
        {!isProcessing && logs.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center p-16 bg-white rounded-xl border border-slate-200 border-dashed shadow-sm text-center">
            <div className="bg-blue-50 p-4 rounded-full mb-4">
              <FileText className="w-10 h-10 text-blue-500" />
            </div>
            <h2 className="text-xl font-semibold text-slate-800 mb-2">Nenhum dado carregado</h2>
            <p className="text-slate-500 max-w-md">
              Faça o upload do arquivo de log para visualizar o perfil de tráfego, sites mais acessados e consumo de banda do usuário.
            </p>
          </div>
        )}

        {/* Dashboard com Dados Processados */}
        {!isProcessing && metrics && (
          <div className="space-y-6 animate-in fade-in duration-500">
            
            <div className="flex items-center gap-2 text-sm text-slate-500 bg-white py-2 px-4 rounded-lg border border-slate-200 inline-flex">
              <FileText className="w-4 h-4" />
              Arquivo analisado: <strong>{fileName}</strong> 
              <span className="mx-2">|</span> 
              Usuário Principal Identificado: <strong className="uppercase">{metrics.mainUser}</strong>
            </div>

            {/* Cards de Resumo */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard 
                title="Total de Conexões" 
                value={metrics.totalSessions.toLocaleString('pt-BR')} 
                subtitle="Sessões registradas no período"
                icon={Activity}
                colorClass="bg-blue-500 text-blue-600"
              />
              <StatCard 
                title="Tráfego Total (Banda)" 
                value={formatBytes(metrics.totalBytes)} 
                subtitle="Soma de download e upload"
                icon={Database}
                colorClass="bg-indigo-500 text-indigo-600"
              />
              <StatCard 
                title="Tempo Ativo Estimado" 
                value={formatDuration(metrics.totalDuration)} 
                subtitle="Soma da duração das sessões"
                icon={Clock}
                colorClass="bg-emerald-500 text-emerald-600"
              />
              <StatCard 
                title="Sites / Apps Únicos" 
                value={Object.keys(metrics.topAppsBySessions).length} 
                subtitle="Destinos diferentes acessados"
                icon={Globe}
                colorClass="bg-amber-500 text-amber-600"
              />
            </div>

            {/* Gráficos Principais */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ProgressBarChart 
                title="Top 50 Sites/Apps Mais Acessados (Por Volume de Acessos)" 
                data={metrics.topAppsBySessions} 
                valueKey="sessions"
                valueFormatter={(val) => `${val} acessos`}
                colorClass="bg-blue-500"
              />
              <ProgressBarChart 
                title="Top 50 Sites/Apps que Mais Consumiram Banda" 
                data={metrics.topAppsByBytes} 
                valueKey="bytes"
                valueFormatter={(val) => formatBytes(val)}
                colorClass="bg-indigo-500"
              />
            </div>

            {/* Gráficos Secundários */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ProgressBarChart 
                title="Principais Categorias de Tráfego" 
                data={metrics.topCategories} 
                valueKey="bytes"
                valueFormatter={(val) => formatBytes(val)}
                colorClass="bg-emerald-500"
              />
              
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-rose-500" />
                  Nível de Risco das Aplicações
                </h3>
                <div className="space-y-4">
                  {metrics.riskLevels.map((item, index) => {
                    // Define cor baseada no nome do risco (elevated, high, medium, low)
                    let barColor = "bg-slate-400";
                    let riskName = item.name.toLowerCase();
                    if (riskName.includes('high') || riskName.includes('elevated')) barColor = "bg-rose-500";
                    else if (riskName.includes('medium')) barColor = "bg-amber-500";
                    else if (riskName.includes('low')) barColor = "bg-emerald-500";

                    const maxSessions = Math.max(...metrics.riskLevels.map(r => r.sessions));
                    const percentage = maxSessions > 0 ? (item.sessions / maxSessions) * 100 : 0;

                    return (
                      <div key={index} className="w-full">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-slate-700 capitalize">{item.name}</span>
                          <span className="text-slate-500">{item.sessions} acessos</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2">
                          <div 
                            className={`${barColor} h-2 rounded-full`} 
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}