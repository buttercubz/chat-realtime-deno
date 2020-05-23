import {
  WebSocket,
  isWebSocketCloseEvent,
} from "https://deno.land/std/ws/mod.ts";
import { v4 } from "https://deno.land/std/uuid/mod.ts";

interface usersList {
  userId: string;
  name: string;
  groupName: string;
  ws: WebSocket;
}

interface IMessage {
  userId: string;
  name: string;
  message: string;
}

const usersMap = new Map();

const groupsMap = new Map();

const messagesMap = new Map();

export default async function Chat(ws: WebSocket) {
  const userId = v4.generate();

  for await (let data of ws) {
    const event = typeof data === "string" ? JSON.parse(data) : data;

    if (isWebSocketCloseEvent(data)) {
      leaveGroup(userId);
      break;
    }

    let userObj: usersList;

    switch (event.event) {
      case "join":
        userObj = {
          userId,
          name: event.name,
          groupName: event.groupName,
          ws,
        };

        usersMap.set(userId, userObj);

        const users = groupsMap.get(event.groupName) || [];
        users.push(userObj);
        groupsMap.set(event.groupName, users);

        emitUserList(event.groupName);

        emitPreviousMessages(event.groupName, ws);
        break;

      case "message":
        userObj = usersMap.get(userId);
        const message = {
          userId,
          name: userObj.name,
          message: event.data,
        };
        const messages = messagesMap.get(userObj.groupName) || [];
        messages.push(message);
        messagesMap.set(userObj.groupName, messages);
        emitMessage(userObj.groupName, message, userId);
        break;
    }
  }
}

function emitUserList(groupName: string) {
  const users = groupsMap.get(groupName) || [];

  for (const user of users) {
    const event = {
      event: "users",
      data: getDisplayUsers(groupName),
    };
    user.ws.send(JSON.stringify(event));
  }
}

function getDisplayUsers(groupName: string) {
  const users = groupsMap.get(groupName) || [];
  // @ts-ignore
  return users.map((u) => {
    return { userId: u.userId, name: u.name };
  });
}

function emitMessage(groupName: string, message: IMessage, senderId: string) {
  const users = groupsMap.get(groupName) || [];
  for (const user of users) {
    const tmpMessage = {
      ...message,
      sender: user.userId === senderId ? "me" : senderId,
    };
    const event = {
      event: "message",
      data: tmpMessage,
    };
    user.ws.send(JSON.stringify(event));
  }
}

function emitPreviousMessages(groupName: string, ws: WebSocket) {
  const messages = messagesMap.get(groupName) || [];

  const event = {
    event: "previousMessages",
    data: messages,
  };
  ws.send(JSON.stringify(event));
}

function leaveGroup(userId: string) {
  const userObj = usersMap.get(userId);
  if (!userObj) {
    return;
  }
  let users = groupsMap.get(userObj.groupName) || [];

  // @ts-ignore
  users = users.filter((u) => u.userId !== userId);
  groupsMap.set(userObj.groupName, users);

  usersMap.delete(userId);

  emitUserList(userObj.groupName);
}
