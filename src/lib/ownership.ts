import { prisma } from "@/lib/prisma";

// O filtro central só protege o where da consulta. Um id vindo do navegador que é GRAVADO como campo
// (leadId, campaignId) precisa desta conferência antes: a consulta já é filtrada pelo cliente da sessão.
export const ownsLead = async (id: string) => !!(await prisma.lead.findUnique({ where: { id }, select: { id: true } }));
export const ownsCampaign = async (id: string) => !!(await prisma.campaign.findUnique({ where: { id }, select: { id: true } }));
