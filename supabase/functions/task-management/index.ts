import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth } from '../_shared/jwt-verification.ts';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, access_token, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // Verify JWT token and get user ID
    const authResult = await requireAuth(req);
    if (!authResult.valid) {
      console.warn('[task-management] auth_failed');
      return authResult.response;
    }
    const authenticatedUserId = authResult.user_id;
    console.log('[task-management] auth_success', {
      userId: String(authenticatedUserId).slice(0, 8)
    });
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    if (!action) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Action parameter is required'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 400
      });
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase configuration missing');
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    switch(action){
      case 'list':
        return await handleListTasks(req, supabase, authenticatedUserId);
      case 'create':
        return await handleCreateTask(req, supabase, authenticatedUserId);
      case 'update':
        return await handleUpdateTask(req, supabase, authenticatedUserId);
      case 'delete':
        return await handleDeleteTask(req, supabase, authenticatedUserId);
      default:
        return new Response(JSON.stringify({
          success: false,
          error: 'Invalid action. Must be: list, create, update, delete'
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          status: 400
        });
    }
  } catch (error) {
    console.error('Task management error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 500
    });
  }
});
async function handleListTasks(req, supabase, userId) {
  const url = new URL(req.url);
  const category = url.searchParams.get('category');
  const status = url.searchParams.get('status');
  const priority = url.searchParams.get('priority');
  const sessionId = url.searchParams.get('session_id');
  const selectColumns = sessionId ? '*, sailing_session_tasks!inner()' : '*';
  let query = supabase.from('tasks').select(selectColumns).eq('user_id', userId);
  if (sessionId) query = query.eq('sailing_session_tasks.session_id', sessionId);
  if (category) query = query.eq('category', category);
  if (status) query = query.eq('status', status);
  if (priority) query = query.eq('priority', parseInt(priority));
  query = query.order('priority', {
    ascending: true
  }).order('order_index', {
    ascending: true
  }).order('created_at', {
    ascending: false
  });
  const { data: tasks, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch tasks: ${error.message}`);
  }
  const tasksResult = sessionId ? (tasks || []).map((t)=>{
    const { sailing_session_tasks: _sailing_session_tasks, ...rest } = t;
    return rest;
  }) : tasks || [];
  return new Response(JSON.stringify({
    success: true,
    tasks: tasksResult,
    total_count: tasksResult.length
  }), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    },
    status: 200
  });
}
async function handleCreateTask(req, supabase, userId) {
  const body = await req.json();
  const { title, description, priority, category, due_date, status = 'pending', session_id } = body ?? {};
  if (!title || !priority) {
    return new Response(JSON.stringify({
      success: false,
      error: 'title and priority are required'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 400
    });
  }
  if (session_id) {
    const { data: session, error: sessionError } = await supabase.from('sailing_sessions').select('id, user_id').eq('id', session_id).single();
    if (sessionError || !session) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid session_id'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 400
      });
    }
    if (session.user_id !== userId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Session does not belong to user'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 403
      });
    }
  }
  const { data: lastTask } = await supabase.from('tasks').select('order_index').eq('user_id', userId).order('order_index', {
    ascending: false
  }).limit(1).single();
  const nextOrderIndex = (lastTask?.order_index || 0) + 1;
  const { data: task, error } = await supabase.from('tasks').insert({
    user_id: userId,
    title,
    description,
    priority,
    category,
    due_date,
    status,
    order_index: nextOrderIndex
  }).select().single();
  if (error) {
    throw new Error(`Failed to create task: ${error.message}`);
  }
  if (session_id && task?.id) {
    const { error: joinError } = await supabase.from('sailing_session_tasks').upsert({
      session_id,
      task_id: task.id
    }, {
      onConflict: 'session_id,task_id',
      ignoreDuplicates: true
    });
    if (joinError) {
      console.warn('Failed to assign task to session:', joinError);
    }
  }
  return new Response(JSON.stringify({
    success: true,
    task
  }), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    },
    status: 201
  });
}
async function handleUpdateTask(req, supabase, userId) {
  const body = await req.json();
  const { task_id, title, description, priority, category, status, due_date, order_index, session_id } = body ?? {};
  if (!task_id) {
    return new Response(JSON.stringify({
      success: false,
      error: 'task_id is required'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 400
    });
  }
  if (session_id) {
    const { data: session, error: sessionError } = await supabase.from('sailing_sessions').select('id, user_id').eq('id', session_id).single();
    if (sessionError || !session) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid session_id'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 400
      });
    }
    if (session.user_id !== userId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Session does not belong to user'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 403
      });
    }
    const { data: membership } = await supabase.from('sailing_session_tasks').select('session_id, task_id').eq('session_id', session_id).eq('task_id', task_id).maybeSingle();
    if (!membership) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Task not in specified session'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 404
      });
    }
  }
  const updateData = {};
  if (title !== undefined) updateData.title = title;
  if (description !== undefined) updateData.description = description;
  if (priority !== undefined) updateData.priority = priority;
  if (category !== undefined) updateData.category = category;
  if (status !== undefined) {
    updateData.status = status;
    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    } else {
      updateData.completed_at = null;
    }
  }
  if (due_date !== undefined) updateData.due_date = due_date;
  if (order_index !== undefined) updateData.order_index = order_index;
  const { data: task, error } = await supabase.from('tasks').update(updateData).eq('id', task_id).eq('user_id', userId).select().single();
  if (error) {
    throw new Error(`Failed to update task: ${error.message}`);
  }
  if (!task) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Task not found or access denied'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 404
    });
  }
  return new Response(JSON.stringify({
    success: true,
    task
  }), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    },
    status: 200
  });
}
async function handleDeleteTask(req, supabase, userId) {
  const body = await req.json();
  const { task_id, session_id } = body ?? {};
  if (!task_id) {
    return new Response(JSON.stringify({
      success: false,
      error: 'task_id is required'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 400
    });
  }
  if (session_id) {
    const { data: session, error: sessionError } = await supabase.from('sailing_sessions').select('id, user_id').eq('id', session_id).single();
    if (sessionError || !session) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid session_id'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 400
      });
    }
    if (session.user_id !== userId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Session does not belong to user'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 403
      });
    }
    const { data: membership } = await supabase.from('sailing_session_tasks').select('session_id, task_id').eq('session_id', session_id).eq('task_id', task_id).maybeSingle();
    if (!membership) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Task not in specified session'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 404
      });
    }
  }
  const { error } = await supabase.from('tasks').delete().eq('id', task_id).eq('user_id', userId);
  if (error) {
    throw new Error(`Failed to delete task: ${error.message}`);
  }
  return new Response(JSON.stringify({
    success: true,
    message: 'Task deleted successfully'
  }), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    },
    status: 200
  });
} // Removed: getUserIdFromAuth - now using requireAuth from jwt-verification.ts
