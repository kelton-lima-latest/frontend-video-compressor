import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  UploadCloud,
  Video,
  RefreshCw,
  Download,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * VideoUploadProcessor
 *
 * Frontend completo para upload, acompanhamento de processamento e download.
 *
 * Endpoints esperados:
 * - POST /upload
 * - GET /status/{video_id}
 * - GET /download/{video_id}
 *
 * Observação:
 * - O código usa XMLHttpRequest no upload para suportar progresso real.
 * - O status é atualizado via polling.
 */

const API_BASE_URL = ""; // Ex.: "http://localhost:8000". Deixe vazio para mesma origem.
const POLLING_INTERVAL_MS = 3000;
const MAX_AUTO_RETRIES = 2;

const UI_STATE = {
  IDLE: "idle",
  UPLOADING: "uploading",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
};

function buildUrl(path) {
  return `${API_BASE_URL}${path}`;
}

function isVideoFile(file) {
  return file?.type?.startsWith("video/") || /\.(mp4|mov|avi|mkv|webm|mpeg|mpg|m4v)$/i.test(file?.name || "");
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "-";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  if (bytes === 0) return "0 B";
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 2)} ${sizes[i]}`;
}

function statusMeta(status) {
  switch (status) {
    case UI_STATE.COMPLETED:
      return {
        label: "completed",
        className: "bg-green-100 text-green-800 border-green-200",
        icon: CheckCircle2,
      };
    case UI_STATE.PROCESSING:
    case UI_STATE.UPLOADING:
      return {
        label: status === UI_STATE.UPLOADING ? "uploading" : "processing",
        className: "bg-yellow-100 text-yellow-800 border-yellow-200",
        icon: Loader2,
      };
    case UI_STATE.FAILED:
      return {
        label: "failed",
        className: "bg-red-100 text-red-800 border-red-200",
        icon: AlertCircle,
      };
    default:
      return {
        label: "idle",
        className: "bg-slate-100 text-slate-700 border-slate-200",
        icon: Video,
      };
  }
}

function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      className="fixed bottom-6 right-6 z-50 w-[calc(100vw-2rem)] max-w-sm"
      role="status"
      aria-live="polite"
    >
      <div
        className={`rounded-2xl border p-4 shadow-xl backdrop-blur bg-white/95 ${
          toast.type === "error"
            ? "border-red-200"
            : toast.type === "success"
            ? "border-green-200"
            : "border-slate-200"
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            {toast.type === "error" ? (
              <AlertCircle className="h-5 w-5 text-red-600" />
            ) : toast.type === "success" ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900">{toast.title}</p>
            <p className="mt-1 text-sm text-slate-600">{toast.description}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Fechar notificação"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function StatusBadge({ status }) {
  const meta = statusMeta(status);
  const Icon = meta.icon;
  return (
    <Badge className={`border px-3 py-1 text-sm font-medium ${meta.className}`}>
      <Icon className={`mr-2 h-4 w-4 ${status === UI_STATE.PROCESSING || status === UI_STATE.UPLOADING ? "animate-spin" : ""}`} />
      {meta.label}
    </Badge>
  );
}

function uploadVideo({ file, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);

    xhr.open("POST", buildUrl("/upload"));
    xhr.responseType = "json";

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && typeof onProgress === "function") {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      const ok = xhr.status >= 200 && xhr.status < 300;
      if (!ok) {
        reject(new Error(xhr.response?.detail || "Falha no upload do vídeo."));
        return;
      }

      const data = xhr.response;
      if (!data?.video_id) {
        reject(new Error("Resposta inválida da API. Campo video_id não encontrado."));
        return;
      }

      resolve(data);
    };

    xhr.onerror = () => reject(new Error("Erro de rede durante o upload."));
    xhr.ontimeout = () => reject(new Error("Tempo limite excedido no upload."));

    xhr.send(formData);
  });
}

async function fetchStatus(videoId) {
  const response = await fetch(buildUrl(`/status/${videoId}`), {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error("Não foi possível consultar o status do processamento.");
  }

  return response.json();
}

export default function VideoUploadProcessor() {
  const inputRef = useRef(null);
  const pollingRef = useRef(null);
  const retryCountRef = useRef(0);

  const [dragActive, setDragActive] = useState(false);
  const [uiState, setUiState] = useState(UI_STATE.IDLE);
  const [file, setFile] = useState(null);
  const [videoId, setVideoId] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Aguardando envio de vídeo.");
  const [backendStatus, setBackendStatus] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  const currentStatus = useMemo(() => {
    if (uiState === UI_STATE.UPLOADING) return UI_STATE.UPLOADING;
    if (backendStatus === "completed") return UI_STATE.COMPLETED;
    if (backendStatus === "failed") return UI_STATE.FAILED;
    if (backendStatus === "processing") return UI_STATE.PROCESSING;
    return uiState;
  }, [uiState, backendStatus]);

  const resetPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const showToast = useCallback((type, title, description) => {
    setToast({ type, title, description });
  }, []);

  const resetAll = useCallback(() => {
    resetPolling();
    retryCountRef.current = 0;
    setDragActive(false);
    setUiState(UI_STATE.IDLE);
    setFile(null);
    setVideoId("");
    setUploadProgress(0);
    setStatusMessage("Aguardando envio de vídeo.");
    setBackendStatus(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }, [resetPolling]);

  const handleStatusUpdate = useCallback(
    async (id) => {
      try {
        const data = await fetchStatus(id);
        const normalizedStatus = String(data?.status || "processing").toLowerCase();
        setBackendStatus(normalizedStatus);

        if (normalizedStatus === "completed") {
          setUiState(UI_STATE.COMPLETED);
          setStatusMessage("Processamento concluído. O download já está disponível.");
          resetPolling();
          showToast("success", "Vídeo processado", "Seu arquivo está pronto para download.");
          return;
        }

        if (normalizedStatus === "failed") {
          setUiState(UI_STATE.FAILED);
          setStatusMessage("O processamento falhou.");
          setError(data?.detail || "O backend informou falha no processamento.");
          resetPolling();

          if (retryCountRef.current < MAX_AUTO_RETRIES && file) {
            retryCountRef.current += 1;
            showToast(
              "info",
              "Nova tentativa automática",
              `Tentando novamente (${retryCountRef.current}/${MAX_AUTO_RETRIES})...`
            );
            setTimeout(() => {
              startUpload(file, true);
            }, 1500);
          } else {
            showToast("error", "Falha no processamento", data?.detail || "Não foi possível concluir o processamento.");
          }
          return;
        }

        setUiState(UI_STATE.PROCESSING);
        setStatusMessage(data?.message || "Seu vídeo está sendo processado.");
      } catch (err) {
        setError(err.message || "Erro ao consultar status.");
      }
    },
    [file, resetPolling, showToast]
  );

  const startPolling = useCallback(
    (id) => {
      resetPolling();
      pollingRef.current = setInterval(() => {
        handleStatusUpdate(id);
      }, POLLING_INTERVAL_MS);
      handleStatusUpdate(id);
    },
    [handleStatusUpdate, resetPolling]
  );

  const startUpload = useCallback(
    async (selectedFile, isRetry = false) => {
      try {
        setError("");
        setBackendStatus(null);
        setUiState(UI_STATE.UPLOADING);
        setStatusMessage(isRetry ? "Reenviando vídeo..." : "Enviando vídeo...");
        setUploadProgress(0);
        if (!isRetry) setVideoId("");

        const data = await uploadVideo({
          file: selectedFile,
          onProgress: (value) => setUploadProgress(value),
        });

        setVideoId(data.video_id);
        setUiState(UI_STATE.PROCESSING);
        setBackendStatus("processing");
        setStatusMessage("Upload concluído. Iniciando processamento...");
        showToast("success", "Upload concluído", "Agora estamos acompanhando o processamento do vídeo.");
        startPolling(data.video_id);
      } catch (err) {
        setUiState(UI_STATE.FAILED);
        setError(err.message || "Falha ao enviar o vídeo.");
        setStatusMessage("Não foi possível concluir o upload.");
        showToast("error", "Erro no upload", err.message || "Falha inesperada durante o envio.");
      }
    },
    [showToast, startPolling]
  );

  const handleSelectedFile = useCallback(
    (selectedFile) => {
      if (!selectedFile) return;

      if (!isVideoFile(selectedFile)) {
        setError("Arquivo inválido. Selecione um arquivo de vídeo.");
        setUiState(UI_STATE.FAILED);
        showToast("error", "Arquivo inválido", "Apenas arquivos de vídeo são aceitos.");
        return;
      }

      retryCountRef.current = 0;
      setFile(selectedFile);
      setError("");
      setStatusMessage("Arquivo validado. Preparando upload...");
      startUpload(selectedFile);
    },
    [showToast, startUpload]
  );

  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((event) => {
    event.preventDefault();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (event) => {
      event.preventDefault();
      setDragActive(false);
      const droppedFile = event.dataTransfer.files?.[0];
      handleSelectedFile(droppedFile);
    },
    [handleSelectedFile]
  );

  const handleInputChange = useCallback(
    (event) => {
      const selectedFile = event.target.files?.[0];
      handleSelectedFile(selectedFile);
    },
    [handleSelectedFile]
  );

  const handleManualRetry = useCallback(() => {
    if (!file) return;
    retryCountRef.current = 0;
    startUpload(file);
  }, [file, startUpload]);

  const handleDownload = useCallback(() => {
    if (!videoId) return;
    window.open(buildUrl(`/download/${videoId}`), "_blank", "noopener,noreferrer");
  }, [videoId]);

  useEffect(() => {
    return () => resetPolling();
  }, [resetPolling]);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="overflow-hidden rounded-3xl border-0 shadow-xl">
            <CardHeader className="border-b bg-white/90 backdrop-blur">
              <CardTitle className="text-2xl font-semibold tracking-tight">Upload e processamento de vídeo</CardTitle>
              <CardDescription className="text-base">
                Faça upload do arquivo, acompanhe o status em tempo real e baixe o resultado quando estiver pronto.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6 p-6">
              <div
                role="button"
                tabIndex={0}
                aria-label="Área de upload de vídeo via arrastar e soltar"
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    inputRef.current?.click();
                  }
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`group relative rounded-3xl border-2 border-dashed p-8 transition-all focus:outline-none focus:ring-2 focus:ring-slate-400 ${
                  dragActive
                    ? "border-slate-900 bg-slate-100"
                    : "border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50"
                }`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleInputChange}
                  aria-label="Selecionar arquivo de vídeo"
                />

                <div className="flex flex-col items-center justify-center text-center">
                  <div className="mb-4 rounded-2xl bg-slate-100 p-4 transition-transform group-hover:scale-105">
                    <UploadCloud className="h-10 w-10" />
                  </div>
                  <h2 className="text-xl font-semibold">Arraste seu vídeo aqui</h2>
                  <p className="mt-2 max-w-xl text-sm text-slate-600">
                    Ou clique para selecionar manualmente. Formatos de vídeo comuns são aceitos, com validação básica no cliente.
                  </p>
                  <p className="mt-4 text-sm font-medium text-slate-800">Drag and Drop ou seleção manual</p>
                </div>
              </div>

              <AnimatePresence mode="wait">
                {file && (
                  <motion.div
                    key="file-info"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="rounded-2xl border bg-white p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{file.name}</p>
                        <p className="mt-1 text-sm text-slate-600">{formatBytes(file.size)}</p>
                      </div>
                      <StatusBadge status={currentStatus} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">Progresso do upload</span>
                  <span className="text-slate-500">
                    {uiState === UI_STATE.UPLOADING ? `${uploadProgress}%` : uiState === UI_STATE.PROCESSING ? "Processando..." : "Aguardando"}
                  </span>
                </div>

                {uiState === UI_STATE.UPLOADING ? (
                  <Progress value={uploadProgress} aria-label="Progresso do upload" className="h-3" />
                ) : uiState === UI_STATE.PROCESSING ? (
                  <div
                    className="relative h-3 overflow-hidden rounded-full bg-slate-200"
                    aria-label="Processamento em andamento"
                    aria-valuetext="Processamento em andamento"
                  >
                    <motion.div
                      className="absolute inset-y-0 w-1/3 rounded-full bg-slate-900"
                      animate={{ x: ["-120%", "320%"] }}
                      transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
                    />
                  </div>
                ) : (
                  <Progress value={0} aria-label="Sem upload em andamento" className="h-3 opacity-60" />
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <Button onClick={() => inputRef.current?.click()} className="rounded-2xl">
                  Selecionar vídeo
                </Button>

                {currentStatus === UI_STATE.COMPLETED && (
                  <Button onClick={handleDownload} variant="secondary" className="rounded-2xl">
                    <Download className="mr-2 h-4 w-4" />
                    Baixar vídeo processado
                  </Button>
                )}

                {currentStatus === UI_STATE.FAILED && file && (
                  <Button onClick={handleManualRetry} variant="outline" className="rounded-2xl">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Tentar novamente
                  </Button>
                )}

                {(file || currentStatus !== UI_STATE.IDLE) && (
                  <Button onClick={resetAll} variant="ghost" className="rounded-2xl">
                    Limpar estado
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <div className="space-y-6">
            <Card className="rounded-3xl border-0 shadow-xl">
              <CardHeader>
                <CardTitle className="text-lg">Status atual</CardTitle>
                <CardDescription>Feedback visual claro em todas as etapas do fluxo.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-600">Estado da interface</span>
                  <StatusBadge status={currentStatus} />
                </div>

                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-800">Mensagem</p>
                  <p className="mt-1 text-sm text-slate-600">{statusMessage}</p>
                </div>

                {videoId && (
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm font-medium text-slate-800">video_id</p>
                    <p className="mt-1 break-all text-sm text-slate-600">{videoId}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {error && (
              <Alert className="rounded-3xl border-red-200 bg-red-50 text-red-900 shadow-sm">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Ocorreu um erro</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Card className="rounded-3xl border-0 shadow-xl">
              <CardHeader>
                <CardTitle className="text-lg">Arquitetura sugerida</CardTitle>
                <CardDescription>Estrutura simples, escalável e fácil de evoluir.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm text-slate-600">
                  <li>
                    <span className="font-semibold text-slate-900">Componente principal:</span> coordena upload, polling,
                    estados visuais e ações do usuário.
                  </li>
                  <li>
                    <span className="font-semibold text-slate-900">Camada de API:</span> funções isoladas para upload,
                    consulta de status e download.
                  </li>
                  <li>
                    <span className="font-semibold text-slate-900">UI desacoplada:</span> badge, toast e blocos visuais
                    reutilizáveis.
                  </li>
                  <li>
                    <span className="font-semibold text-slate-900">Escalabilidade:</span> fácil migração para Zustand,
                    React Query ou WebSocket no futuro.
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
      </AnimatePresence>
    </div>
  );
}
