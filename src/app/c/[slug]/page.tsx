import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prismaSystem } from "@/lib/prisma";
import { formToken, isCaptureSlug } from "@/lib/capture";
import { CaptureForm } from "./CaptureForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fale com a gente", robots: { index: false, follow: false } };

// Página pública do formulário de captação de uma campanha (link e QR Code). Quem abre não tem login.
export default async function CapturePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isCaptureSlug(slug)) notFound();
  // Página pública: não há sessão, então o cliente vem da própria campanha (o código dela é global).
  const campaign = await prismaSystem.campaign.findFirst({
    where: { captureSlug: slug, captureOn: true, status: "ACTIVE", client: { status: "ACTIVE" } },
    select: { name: true, captureTitle: true, captureText: true, clientId: true },
  });
  if (!campaign) notFound();
  const settings = await prismaSystem.settings.findUniqueOrThrow({ where: { clientId: campaign.clientId }, select: { ownerName: true } });
  const owner = settings.ownerName?.trim() || "nossa equipe";
  const title = campaign.captureTitle || campaign.name;

  return (
    <main className="legal" style={{ maxWidth: 520, marginInline: "auto", padding: "32px 16px 64px" }}>
      <h1 style={{ fontSize: 30, marginBottom: 8 }}>{title}</h1>
      {campaign.captureText && <p style={{ marginTop: 0, marginBottom: 20 }}>{campaign.captureText}</p>}
      <CaptureForm slug={slug} token={formToken()} owner={owner} title={title} />
    </main>
  );
}
