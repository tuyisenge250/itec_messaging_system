import { prisma } from "@/infrastructure/database/prisma";
import type { Prisma, Environment, SimulatorFinalStatus } from "@/generated/prisma/client";

export const simulatorRepository = {
  listEnabledByPriority(environment: Environment) {
    return prisma.simulatorScenario.findMany({
      where: { enabled: true, environment },
      orderBy: { priority: "desc" },
    });
  },

  list() {
    return prisma.simulatorScenario.findMany({ orderBy: [{ priority: "desc" }, { createdAt: "desc" }] });
  },

  findById(id: string) {
    return prisma.simulatorScenario.findUnique({ where: { id } });
  },

  create(data: Prisma.SimulatorScenarioCreateInput) {
    return prisma.simulatorScenario.create({ data });
  },

  update(id: string, data: Prisma.SimulatorScenarioUpdateInput) {
    return prisma.simulatorScenario.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.simulatorScenario.delete({ where: { id } });
  },

  createExecution(data: Prisma.SimulatorExecutionCreateInput) {
    return prisma.simulatorExecution.create({ data });
  },

  resolveExecution(id: string, finalStatus: SimulatorFinalStatus) {
    return prisma.simulatorExecution.update({ where: { id }, data: { finalStatus, resolvedAt: new Date() } });
  },

  listExecutions(params: { take: number; cursor?: string }) {
    return prisma.simulatorExecution.findMany({
      orderBy: { executedAt: "desc" },
      take: params.take,
      include: { scenario: { select: { id: true, name: true } } },
      ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
    });
  },
};
