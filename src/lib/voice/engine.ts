// Escolhe o serviço de voz pela voz que o usuário configurou: ElevenLabs (voz pronta ou a gravada por ele) ou Fish (vozes gravadas antigas).
import { deleteVoice, fishConfigured, synthesize, VoiceError } from "@/lib/voice/fish";
import { deleteVoiceEleven, elevenConfigured, synthesizeEleven } from "@/lib/voice/elevenlabs";
import type { VoiceSettings } from "@/lib/voice/settings";

export function voiceServiceReady(voice: Pick<VoiceSettings, "provider">): boolean {
  return voice.provider === "elevenlabs" ? elevenConfigured() : fishConfigured();
}

export function speak(voice: Pick<VoiceSettings, "provider" | "voiceId">, text: string): Promise<{ bytes: Buffer; mime: string }> {
  if (!voice.voiceId) throw new VoiceError("Nenhuma voz escolhida.");
  return voice.provider === "elevenlabs" ? synthesizeEleven(text, voice.voiceId) : synthesize(text, voice.voiceId);
}

// Voz pronta não é nossa para apagar; só a gravada pelo usuário some do serviço.
export async function removeVoice(voice: Pick<VoiceSettings, "provider" | "voiceId" | "cloned">): Promise<void> {
  if (!voice.voiceId) return;
  if (voice.provider === "fish") await deleteVoice(voice.voiceId);
  else if (voice.cloned) await deleteVoiceEleven(voice.voiceId);
}
