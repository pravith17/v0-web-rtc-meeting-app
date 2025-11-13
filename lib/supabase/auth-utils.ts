import { createClient } from "@/lib/supabase/client"

export async function signUp(email: string, password: string, username: string) {
  const supabase = createClient()

  // Sign up auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/home`,
      data: {
        username,
      },
    },
  })

  if (authError) throw authError
  if (!authData.user) throw new Error("Sign up failed")

  try {
    const { error: profileError } = await supabase.from("profiles").insert({
      id: authData.user.id,
      username: username,
    })

    if (profileError && !profileError.message.includes("unique constraint")) {
      console.error("Profile creation error:", profileError)
      throw profileError
    }
  } catch (e) {
    console.error("Failed to create profile:", e)
    // Don't throw - user was created successfully, profile will be created by trigger
  }

  return authData
}

export async function signIn(email: string, password: string) {
  const supabase = createClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) throw error
  return data
}

export async function signOut() {
  const supabase = createClient()
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getCurrentUser() {
  const supabase = createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error) throw error
  return user
}
