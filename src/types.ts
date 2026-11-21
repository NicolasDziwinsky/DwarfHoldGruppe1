export type JobType = "woodcutting" | "mining" | "farming" | null;
export type DwarfStatus = "idle" | "working" | "crafting" | "expedition";
export interface Resources { wood: number; stone: number; food: number; tools: number; swords: number; }
export type ResourceKey = keyof Resources;

export interface Dwarf { 
    id: string;
     name: string; 
     title: string; 
     icon: string; 
     assignment: JobType; 
     status: DwarfStatus; 
     specialty?: Exclude<JobType, null> 
     toolEquipped?: boolean
}

export interface ColonyState { 
    day: number; 
    resources: Resources; 
    dwarves: Dwarf[] 
    hungry: boolean;
    craftingTasks: CraftingTask[];
}

export interface ExpeditionResult { 
    expeditionId: string; 
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
}

export interface CraftingTask {
    dwarfId: string;
    recipe: CraftingRecipe;
    daysRemaining: number;
}
