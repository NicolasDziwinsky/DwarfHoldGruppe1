export type JobType = "woodcutting" | "mining" | "farming" | null;
export type DwarfStatus = "idle" | "working" | "crafting" | "expedition";
export interface Resources { wood: number; stone: number; food: number; tools: number; swords: number; }
export type ResourceKey = keyof Resources;

export type ResidentSpecies = "dwarf" | "mole-beast";

export interface Resident {
    id: string;
    name: string;
    title: string;
    icon: string;
    species: ResidentSpecies;
    assignment: JobType;
    status: DwarfStatus;
    specialty?: Exclude<JobType, null>;
    toolEquipped?: boolean;
    travellingTo?: string;
}

export interface ColonyState { 
    day: number; 
    resources: Resources; 
    dwarves: Resident[] 
    hungry: boolean;
    craftingTasks: CraftingTask[];
    completedExpeditions: string[];
    crystalCaveResidentJoined: boolean;
}

export interface ExpeditionResult { 
    expeditionId: string;
    destination: string; 
    status: "completed"; 
    rewards: Partial<Resources>; 
    message: string 
}

export interface Activity { 
    id: string; 
    day: number; 
    message: string; 
    tone?: "good" | "warning" 
}

export interface CraftingRecipe {
    name: string;
    icon: string;
    requiredResources: Partial<Resources>;
    rewards: Partial<Resources>; 
    daysToComplete: number;
    eligibleSpecies: ResidentSpecies[];
}

export interface CraftingTask {
    dwarfId: string;
    recipe: CraftingRecipe;
    daysRemaining: number;
}
